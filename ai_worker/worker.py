"""
worker.py — Main AI inference loop with multi-camera threading.

Architecture:
  - main() fetches camera list from the backend REST API.
  - Loads ONE shared Detector (single YOLOv8 model in memory).
  - Spawns one CameraWorker thread per camera.
  - Each CameraWorker reads frames, runs detect(), applies rules, POSTs alerts.
  - Reconnects automatically with exponential backoff on stream failure.
"""

import cv2
import os
import sys
import time
import json
import threading
import requests
from datetime import datetime, timezone

# Add parent dir so pipeline imports work when run directly
sys.path.insert(0, os.path.dirname(__file__))

from pipeline.detector import Detector
from pipeline.rules import RulesEngine
from pipeline.clip_saver import ClipSaver
from pipeline import mjpeg_server

# --- Config from environment ---
API_BASE        = os.environ.get('API_URL',      'http://localhost:3000/api/ingest/event')
CAMERAS_URL     = os.environ.get('CAMERAS_URL',  'http://localhost:3000/api/cameras')
MODEL_NAME      = os.environ.get('YOLO_MODEL',   'yolov8s.pt')
DEVICE          = os.environ.get('YOLO_DEVICE',  'cpu')   # 'cuda' for GPU
SKIP_FRAMES     = int(os.environ.get('SKIP_FRAMES', '2'))  # Run inference every Nth frame
INGEST_API_KEY  = os.environ.get('INGEST_API_KEY', 'sar-dev-ingest-key-change-in-prod')

# Shared request headers for authenticated API calls
API_HEADERS     = {'X-API-Key': INGEST_API_KEY}

# Derived
EVENTS_BASE     = API_BASE.replace('/ingest/event', '/events')
CONFIG_URL      = API_BASE.replace('/ingest/event', '/config')


# ---------------------------------------------------------------------------
# Backend communication helpers
# ---------------------------------------------------------------------------

def fetch_cameras() -> list[dict] | None:
    """Fetch ACTIVE camera configs from the backend. Returns None on failure."""
    try:
        r = requests.get(CAMERAS_URL, headers=API_HEADERS, timeout=5)
        r.raise_for_status()
        cams = r.json()
        # Only process cameras that are ACTIVE
        cams = [c for c in cams if c.get('status', 'ACTIVE') == 'ACTIVE']
        # Parse roi_polygon JSON string if stored as text
        for cam in cams:
            if cam.get('roi_polygon') and isinstance(cam['roi_polygon'], str):
                try:
                    cam['roi_polygon'] = json.loads(cam['roi_polygon'])
                except Exception:
                    cam['roi_polygon'] = None
        return cams
    except Exception as e:
        print(f"[Worker] Cannot fetch cameras: {e}")
        return None


def fetch_config() -> dict:
    """Fetch AI pipeline configuration from the backend."""
    try:
        r = requests.get(CONFIG_URL, headers=API_HEADERS, timeout=5)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"[Worker] Cannot fetch config: {e}")
        return {}


def post_event(camera_id: int, alert: dict, clip_path: str | None, thumb_path: str | None) -> int | None:
    """POST a detected event to the backend ingest endpoint. Returns event_id or None."""
    payload = {
        'camera_id':      camera_id,
        'activity_type':  alert['activity_type'],
        'severity':       alert['severity'],
        'confidence':     alert['confidence'],
        'timestamp':      datetime.now(timezone.utc).isoformat(),
        'bounding_boxes': alert.get('bounding_boxes', []),
        'metadata':       alert.get('metadata', {}),
        'thumbnail_path': thumb_path,
        'clip_path':      clip_path,
    }
    try:
        r = requests.post(API_BASE, json=payload, headers=API_HEADERS, timeout=5)
        r.raise_for_status()
        data = r.json()
        return data.get('event_id')
    except Exception as e:
        print(f"  [API] Failed to post event: {e}")
        return None


def patch_event_paths(event_id: int, clip_path: str | None, thumb_path: str | None):
    """Update an event row with saved clip/thumbnail paths via the public ingest endpoint."""
    try:
        requests.patch(
            f"{API_BASE.replace('/ingest/event', '')}/ingest/event/{event_id}/media",
            json={'thumbnail_path': thumb_path, 'clip_path': clip_path},
            headers=API_HEADERS,
            timeout=5,
        )
    except Exception:
        pass  # Non-critical — event was already saved and broadcast


# ---------------------------------------------------------------------------
# Per-camera worker
# ---------------------------------------------------------------------------

class CameraWorker:
    def __init__(self, camera_config: dict, detector: Detector, sys_config: dict = None):
        self.cam      = camera_config
        self.cam_id   = camera_config['camera_id']
        self.detector = detector                          # shared, thread-safe for inference
        self.rules    = RulesEngine(camera_config, sys_config or {})        # per-camera state
        self.saver    = ClipSaver(self.cam_id)
        self._running = False
        self._lock    = threading.Lock()

    def _open_stream(self) -> cv2.VideoCapture:
        source = self.cam['source_url']
        # Allow '0', '1', etc. as webcam index
        if isinstance(source, str):
            source = source.strip()
            if source.isdigit():
                source = int(source)
            elif source.startswith('http') and not any(source.endswith(ext) for ext in ['.mp4', '.m3u8', '.mjpg', '.cgi', '.ts']):
                print(f"[Cam {self.cam_id}] Attempting to extract raw stream from webpage...")
                try:
                    import yt_dlp
                    ydl_opts = {'format': 'best[ext=mp4]/best', 'quiet': True, 'noplaylist': True}
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        info = ydl.extract_info(source, download=False)
                        if 'url' in info:
                            source = info['url']
                            print(f"[Cam {self.cam_id}] ✅ Extracted raw stream URL!")
                        elif 'entries' in info and len(info['entries']) > 0:
                            source = info['entries'][0]['url']
                            print(f"[Cam {self.cam_id}] ✅ Extracted raw stream URL from playlist!")
                except Exception as e:
                    print(f"[Cam {self.cam_id}] yt-dlp could not extract stream (it might be a direct link already or unsupported site): {e}")

        return cv2.VideoCapture(source)

    def run(self):
        self._running = True
        cam_id = self.cam_id
        print(f"[Cam {cam_id}] Worker starting → {self.cam['source_url']}")

        retry_delay = 1.0
        max_delay   = 30.0

        while self._running:
            cap = self._open_stream()

            if not cap.isOpened():
                print(f"[Cam {cam_id}] Stream unavailable. Retry in {retry_delay:.0f}s ...")
                time.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, max_delay)  # exponential backoff
                continue

            print(f"[Cam {cam_id}] ✅ Stream connected.")
            retry_delay = 1.0  # reset on success

            frame_idx = 0

            while self._running:
                ret, frame = cap.read()
                if not ret:
                    print(f"[Cam {cam_id}] Stream dropped. Reconnecting ...")
                    break

                # Always feed the clip buffer (needed for pre-event recording)
                self.saver.add_frame(frame)
                # Push frame to MJPEG stream server so browser can display live video
                mjpeg_server.push_frame(self.cam_id, frame)
                frame_idx += 1

                # Only run heavy inference every SKIP_FRAMES frames
                if frame_idx % SKIP_FRAMES != 0:
                    continue

                # --- Detect + Track ---
                try:
                    detections = self.detector.detect(frame)
                except Exception as e:
                    print(f"[Cam {cam_id}] Detection error: {e}")
                    continue

                # --- Apply rules ---
                try:
                    alerts = self.rules.process(detections)
                except Exception as e:
                    print(f"[Cam {cam_id}] Rules error: {e}")
                    continue

                # --- Handle alerts ---
                for alert in alerts:
                    activity = alert['activity_type']
                    conf     = alert['confidence']
                    print(f"[Cam {cam_id}] 🚨 {activity} | conf={conf:.2f}")

                    # Save thumbnail immediately, post event, then write clip async
                    event_id = post_event(cam_id, alert, None, None)
                    if event_id:
                        clip_path, thumb_path = self.saver.save(event_id)
                        if clip_path or thumb_path:
                            patch_event_paths(event_id, clip_path, thumb_path)

            cap.release()

        print(f"[Cam {cam_id}] Worker stopped.")

    def stop(self):
        self._running = False


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("  SAR AI Worker — starting up")
    print(f"  Model:  {MODEL_NAME} on {DEVICE}")
    print(f"  API:    {API_BASE}")
    print("=" * 60)

    # Wait for the backend to be ready (it may still be booting)
    cameras: list[dict] = []
    for attempt in range(1, 16):
        res = fetch_cameras()
        if res is not None:
            cameras = res
            break
        print(f"[Worker] No cameras yet (attempt {attempt}/15). Waiting 3s ...")
        time.sleep(3)

    print(f"[Worker] Found {len(cameras)} camera(s): {[c['name'] for c in cameras]}")

    # Start MJPEG stream server (browser points <img> tags here for live video)
    mjpeg_server.start(port=5001)

    # Fetch system config for AI settings
    sys_config = fetch_config()

    # Spawn one thread per camera.
    workers: dict[int, CameraWorker] = {}
    threads: dict[int, threading.Thread] = {}

    def spawn_camera(cam):
        yolo_size = sys_config.get('yolo_model', 'small')
        model_name = {'nano': 'yolov8n.pt', 'small': 'yolov8s.pt', 'medium': 'yolov8m.pt'}.get(yolo_size, MODEL_NAME)
        conf = sys_config.get('confidence_threshold', 45) / 100.0
        cam_detector = Detector(model_name=model_name, confidence=conf, device=DEVICE)
        w = CameraWorker(cam, cam_detector, sys_config)
        t = threading.Thread(target=w.run, daemon=True, name=f"cam-{cam['camera_id']}")
        workers[cam['camera_id']] = w
        threads[cam['camera_id']] = t
        t.start()

    for cam in cameras:
        spawn_camera(cam)

    print(f"\n[Worker] System running. Will dynamically check for camera changes every 10s. Press Ctrl+C to stop.\n")

    try:
        while True:
            time.sleep(10)
            
            # Dynamic Sync
            latest_cams = fetch_cameras()
            if latest_cams is None:
                continue
                
            latest_cam_map = {c['camera_id']: c for c in latest_cams}
            current_cam_ids = set(workers.keys())
            latest_cam_ids = set(latest_cam_map.keys())
            
            # 1. Stop removed cameras
            for cid in list(current_cam_ids - latest_cam_ids):
                print(f"[Worker] 🛑 Camera {cid} was removed or disabled. Stopping thread.")
                workers[cid].stop()
                threads[cid].join(timeout=3)
                del workers[cid]
                del threads[cid]
                
            # 2. Start new cameras or restart modified cameras
            for cid in latest_cam_ids:
                cam = latest_cam_map[cid]
                if cid not in workers:
                    print(f"[Worker] 🟢 New camera {cid} ({cam['name']}) detected. Starting thread.")
                    spawn_camera(cam)
                else:
                    old_cam = workers[cid].cam
                    if old_cam['source_url'] != cam['source_url'] or str(old_cam.get('roi_polygon')) != str(cam.get('roi_polygon')):
                        print(f"[Worker] 🔄 Camera {cid} ({cam['name']}) config changed. Restarting thread.")
                        workers[cid].stop()
                        threads[cid].join(timeout=3)
                        spawn_camera(cam)

    except KeyboardInterrupt:
        print("\n[Worker] Shutting down ...")
        for w in workers.values():
            w.stop()
        for t in threads.values():
            t.join(timeout=5)
        print("[Worker] Goodbye.")


if __name__ == '__main__':
    main()
