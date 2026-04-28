"""
worker.py - AI inference worker with CPU-friendly shared model scheduling.

Architecture:
  - One capture thread per camera keeps the latest frame and MJPEG stream fresh.
  - One shared Detector instance processes latest frames round-robin.
  - Per-camera RulesEngine state turns detections into alerts.
  - The worker reports health and camera runtime state back to the backend.
"""

import cv2
import json
import os
import sys
import threading
import time
import requests
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(__file__))

from pipeline.detector import Detector
from pipeline.rules import RulesEngine
from pipeline.clip_saver import ClipSaver
from pipeline import mjpeg_server


API_BASE = os.environ.get('API_URL', 'http://localhost:3000/api/ingest/event')
CAMERAS_URL = os.environ.get('CAMERAS_URL', 'http://localhost:3000/api/cameras')
MODEL_NAME = os.environ.get('YOLO_MODEL', 'yolov8n.pt')
DEVICE = os.environ.get('YOLO_DEVICE', 'cpu')
TARGET_FPS = float(os.environ.get('TARGET_FPS', '3'))
INGEST_API_KEY = os.environ.get('INGEST_API_KEY')

if not INGEST_API_KEY:
    raise RuntimeError("Missing required environment variable: INGEST_API_KEY")

API_HEADERS = {'X-API-Key': INGEST_API_KEY}
API_ROOT = API_BASE.replace('/ingest/event', '')
CONFIG_URL = API_BASE.replace('/ingest/event', '/config')

_health_lock = threading.Lock()
_health = {
    'model': MODEL_NAME,
    'device': DEVICE,
    'target_fps': TARGET_FPS,
    'last_successful_backend_sync': None,
    'cameras': {},
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _set_health_camera(camera_id: int, **updates):
    with _health_lock:
        current = _health['cameras'].setdefault(str(camera_id), {})
        current.update(updates)
        current['updated_at'] = _now_iso()


def _remove_health_camera(camera_id: int):
    with _health_lock:
        _health['cameras'].pop(str(camera_id), None)


def health_payload() -> dict:
    with _health_lock:
        cameras = dict(_health['cameras'])
        return {
            'model': _health['model'],
            'device': _health['device'],
            'target_fps': _health['target_fps'],
            'active_cameras': len(cameras),
            'last_successful_backend_sync': _health['last_successful_backend_sync'],
            'cameras': cameras,
        }


def fetch_cameras() -> list[dict] | None:
    """Fetch camera configs from the backend. Explicit DISABLED cameras are skipped."""
    try:
        r = requests.get(CAMERAS_URL, headers=API_HEADERS, timeout=5)
        r.raise_for_status()
        cams = [c for c in r.json() if c.get('status') != 'DISABLED']
        for cam in cams:
            if cam.get('roi_polygon') and isinstance(cam['roi_polygon'], str):
                try:
                    cam['roi_polygon'] = json.loads(cam['roi_polygon'])
                except Exception:
                    cam['roi_polygon'] = None
        with _health_lock:
            _health['last_successful_backend_sync'] = _now_iso()
        return cams
    except Exception as e:
        print(f"[Worker] Cannot fetch cameras: {e}")
        return None


def fetch_config() -> dict:
    try:
        r = requests.get(CONFIG_URL, headers=API_HEADERS, timeout=5)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        print(f"[Worker] Cannot fetch config: {e}")
        return {}


def patch_camera_status(camera_id: int, status: str):
    _set_health_camera(camera_id, status=status)
    try:
        requests.patch(
            f"{API_ROOT}/cameras/{camera_id}/status",
            json={'status': status},
            headers=API_HEADERS,
            timeout=3,
        )
    except Exception as e:
        print(f"[Cam {camera_id}] Could not report status {status}: {e}")


def post_event(camera_id: int, alert: dict) -> int | None:
    payload = {
        'camera_id': camera_id,
        'activity_type': alert['activity_type'],
        'severity': alert['severity'],
        'confidence': alert['confidence'],
        'timestamp': _now_iso(),
        'bounding_boxes': alert.get('bounding_boxes', []),
        'metadata': alert.get('metadata', {}),
    }
    try:
        r = requests.post(API_BASE, json=payload, headers=API_HEADERS, timeout=5)
        r.raise_for_status()
        return r.json().get('event_id')
    except Exception as e:
        print(f"  [API] Failed to post event: {e}")
        return None


def patch_event_paths(event_id: int, clip_path: str | None, thumb_path: str | None):
    try:
        requests.patch(
            f"{API_ROOT}/ingest/event/{event_id}/media",
            json={'thumbnail_path': thumb_path, 'clip_path': clip_path},
            headers=API_HEADERS,
            timeout=5,
        )
    except Exception:
        pass


class CameraWorker:
    def __init__(self, camera_config: dict, sys_config: dict | None = None):
        self.cam = camera_config
        self.cam_id = camera_config['camera_id']
        self.rules = RulesEngine(camera_config, sys_config or {})
        self.saver = ClipSaver(self.cam_id)
        self._running = False
        self._lock = threading.Lock()
        self._latest_frame = None
        self._latest_frame_id = 0
        self._last_log_at = 0.0

    def _log_limited(self, message: str, every_seconds: int = 30):
        now = time.time()
        if now - self._last_log_at >= every_seconds:
            print(message)
            self._last_log_at = now

    def _open_stream(self) -> cv2.VideoCapture | None:
        source = self.cam['source_url']
        if isinstance(source, str):
            source = source.strip()
            if source.startswith('rtsp://internal/'):
                self._log_limited(f"[Cam {self.cam_id}] Demo placeholder stream is offline: {source}")
                return None
            if source.isdigit():
                source = int(source)
            elif source.startswith('http') and not any(source.endswith(ext) for ext in ['.mp4', '.m3u8', '.mjpg', '.cgi', '.ts']):
                self._log_limited(f"[Cam {self.cam_id}] Attempting to extract raw stream from webpage...", 120)
                try:
                    import yt_dlp
                    ydl_opts = {'format': 'best[ext=mp4]/best', 'quiet': True, 'noplaylist': True}
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        info = ydl.extract_info(source, download=False)
                        if 'url' in info:
                            source = info['url']
                        elif 'entries' in info and len(info['entries']) > 0:
                            source = info['entries'][0]['url']
                except Exception as e:
                    self._log_limited(f"[Cam {self.cam_id}] yt-dlp could not extract stream: {e}", 120)

        return cv2.VideoCapture(source)

    def run(self):
        self._running = True
        retry_delay = 1.0
        max_delay = 30.0
        print(f"[Cam {self.cam_id}] Capture worker starting -> {self.cam['source_url']}")

        while self._running:
            patch_camera_status(self.cam_id, 'RETRYING')
            cap = self._open_stream()

            if cap is None or not cap.isOpened():
                if cap is not None:
                    cap.release()
                patch_camera_status(self.cam_id, 'OFFLINE')
                time.sleep(retry_delay)
                retry_delay = min(retry_delay * 2, max_delay)
                continue

            patch_camera_status(self.cam_id, 'ONLINE')
            retry_delay = 1.0

            while self._running:
                ret, frame = cap.read()
                if not ret:
                    self._log_limited(f"[Cam {self.cam_id}] Stream dropped. Reconnecting ...")
                    break

                self.saver.add_frame(frame)
                mjpeg_server.push_frame(self.cam_id, frame)

                with self._lock:
                    self._latest_frame = frame.copy()
                    self._latest_frame_id += 1
                    _set_health_camera(self.cam_id, last_frame_at=_now_iso())

            cap.release()

        patch_camera_status(self.cam_id, 'OFFLINE')
        print(f"[Cam {self.cam_id}] Capture worker stopped.")

    def next_frame(self, last_frame_id: int) -> tuple[int, object] | None:
        with self._lock:
            if self._latest_frame is None or self._latest_frame_id == last_frame_id:
                return None
            return self._latest_frame_id, self._latest_frame.copy()

    def stop(self):
        self._running = False


def build_detector_config(sys_config: dict) -> tuple[str, float]:
    yolo_size = sys_config.get('yolo_model')
    model_name = {'nano': 'yolov8n.pt', 'small': 'yolov8s.pt', 'medium': 'yolov8m.pt'}.get(yolo_size, MODEL_NAME)
    confidence = sys_config.get('confidence_threshold', 45) / 100.0
    return model_name, confidence


def inference_loop(detector: Detector, workers: dict[int, CameraWorker], workers_lock: threading.Lock, stop_event: threading.Event):
    target_interval = 1.0 / max(TARGET_FPS, 0.1)
    last_infer_at: dict[int, float] = {}
    last_frame_ids: dict[int, int] = {}

    print(f"[Worker] Shared inference loop running at up to {TARGET_FPS:g} fps per camera.")
    while not stop_event.is_set():
        now = time.time()
        with workers_lock:
            snapshot = list(workers.values())

        did_work = False
        for worker in snapshot:
            cam_id = worker.cam_id
            if now - last_infer_at.get(cam_id, 0) < target_interval:
                continue

            next_frame = worker.next_frame(last_frame_ids.get(cam_id, -1))
            if next_frame is None:
                continue

            frame_id, frame = next_frame
            last_frame_ids[cam_id] = frame_id
            last_infer_at[cam_id] = now
            did_work = True

            try:
                detections = detector.detect(frame)
                alerts = worker.rules.process(detections)
                _set_health_camera(cam_id, last_inference_at=_now_iso(), detections=len(detections))
            except Exception as e:
                print(f"[Cam {cam_id}] Inference/rules error: {e}")
                continue

            for alert in alerts:
                print(f"[Cam {cam_id}] ALERT {alert['activity_type']} | conf={alert['confidence']:.2f}")
                event_id = post_event(cam_id, alert)
                if event_id:
                    clip_path, thumb_path = worker.saver.save(event_id)
                    if clip_path or thumb_path:
                        patch_event_paths(event_id, clip_path, thumb_path)

        if not did_work:
            time.sleep(0.02)


def main():
    print("=" * 60)
    print("  SAR AI Worker - starting up")
    print(f"  Model:      {MODEL_NAME} on {DEVICE}")
    print(f"  Target FPS: {TARGET_FPS:g} per camera")
    print(f"  API:        {API_BASE}")
    print("=" * 60)

    cameras: list[dict] = []
    for attempt in range(1, 16):
        res = fetch_cameras()
        if res is not None:
            cameras = res
            break
        print(f"[Worker] No cameras yet (attempt {attempt}/15). Waiting 3s ...")
        time.sleep(3)

    sys_config = fetch_config()
    model_name, confidence = build_detector_config(sys_config)
    with _health_lock:
        _health['model'] = model_name

    detector = Detector(model_name=model_name, confidence=confidence, device=DEVICE)
    mjpeg_server.set_health_provider(health_payload)
    mjpeg_server.start(port=5001)

    workers: dict[int, CameraWorker] = {}
    threads: dict[int, threading.Thread] = {}
    workers_lock = threading.Lock()
    stop_event = threading.Event()

    def spawn_camera(cam: dict):
        worker = CameraWorker(cam, sys_config)
        thread = threading.Thread(target=worker.run, daemon=True, name=f"capture-{cam['camera_id']}")
        with workers_lock:
            workers[cam['camera_id']] = worker
            threads[cam['camera_id']] = thread
        _set_health_camera(cam['camera_id'], name=cam.get('name'), status='RETRYING')
        thread.start()

    def stop_camera(camera_id: int):
        with workers_lock:
            worker = workers.pop(camera_id, None)
            thread = threads.pop(camera_id, None)
        if worker:
            worker.stop()
        if thread:
            thread.join(timeout=3)
        _remove_health_camera(camera_id)

    for cam in cameras:
        spawn_camera(cam)

    inference_thread = threading.Thread(
        target=inference_loop,
        args=(detector, workers, workers_lock, stop_event),
        daemon=True,
        name='shared-inference',
    )
    inference_thread.start()

    print(f"[Worker] System running with {len(cameras)} camera(s). Press Ctrl+C to stop.")

    try:
        while True:
            time.sleep(10)
            latest_cams = fetch_cameras()
            if latest_cams is None:
                continue

            latest_cam_map = {c['camera_id']: c for c in latest_cams}
            with workers_lock:
                current_cam_ids = set(workers.keys())
            latest_cam_ids = set(latest_cam_map.keys())

            for cid in list(current_cam_ids - latest_cam_ids):
                print(f"[Worker] Camera {cid} removed or disabled. Stopping.")
                stop_camera(cid)

            for cid in latest_cam_ids:
                cam = latest_cam_map[cid]
                with workers_lock:
                    existing = workers.get(cid)
                if existing is None:
                    print(f"[Worker] New camera {cid} ({cam['name']}) detected. Starting.")
                    spawn_camera(cam)
                elif existing.cam['source_url'] != cam['source_url'] or str(existing.cam.get('roi_polygon')) != str(cam.get('roi_polygon')):
                    print(f"[Worker] Camera {cid} ({cam['name']}) config changed. Restarting.")
                    stop_camera(cid)
                    spawn_camera(cam)

    except KeyboardInterrupt:
        print("\n[Worker] Shutting down ...")
        stop_event.set()
        with workers_lock:
            ids = list(workers.keys())
        for cid in ids:
            stop_camera(cid)
        inference_thread.join(timeout=5)
        print("[Worker] Goodbye.")


if __name__ == '__main__':
    main()
