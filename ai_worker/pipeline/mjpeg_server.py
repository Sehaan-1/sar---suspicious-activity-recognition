"""
mjpeg_server.py — Lightweight Flask MJPEG stream server.

Exposes /stream/<camera_id> endpoints that browsers point an <img> tag at
to receive a live Motion JPEG video stream.

The worker.py pushes frames into push_frame() from each camera thread.
Flask reads the latest frame per camera and encodes as JPEG on the fly.
"""

import cv2
import threading
import time
import numpy as np
from flask import Flask, Response

app = Flask(__name__)

# Shared state: camera_id (int) -> latest BGR frame (numpy array)
# Written by CameraWorker threads, read by Flask request threads.
_frame_store: dict[int, np.ndarray] = {}
_lock = threading.Lock()
_health_provider = None


def push_frame(camera_id: int, frame: np.ndarray):
    """Called by worker.py on every captured frame to update the stream."""
    with _lock:
        _frame_store[camera_id] = frame.copy()


def set_health_provider(provider):
    """Register a callable returning worker-level health details."""
    global _health_provider
    _health_provider = provider


def _placeholder_frame(camera_id: int) -> np.ndarray:
    """Returns a dark grey placeholder frame while the camera initialises."""
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    frame[:] = (30, 30, 30)
    cv2.putText(
        frame,
        f'CAM {camera_id} — Connecting...',
        (60, 250),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.9,
        (80, 80, 80),
        2,
        cv2.LINE_AA,
    )
    return frame


def _generate(camera_id: int):
    """
    Generator that yields MJPEG boundary frames for a given camera.
    Runs inside a Flask request thread for each connected browser client.
    """
    while True:
        with _lock:
            frame = _frame_store.get(camera_id)

        if frame is None:
            frame = _placeholder_frame(camera_id)

        ok, buf = cv2.imencode(
            '.jpg', frame,
            [cv2.IMWRITE_JPEG_QUALITY, 72]
        )
        if ok:
            yield (
                b'--frame\r\n'
                b'Content-Type: image/jpeg\r\n\r\n'
                + buf.tobytes()
                + b'\r\n'
            )

        time.sleep(1 / 20)   # cap at ~20 fps to browser


@app.route('/stream/<int:camera_id>')
def stream(camera_id: int):
    """MJPEG stream endpoint — point an <img> tag here."""
    return Response(
        _generate(camera_id),
        mimetype='multipart/x-mixed-replace; boundary=frame',
    )


@app.route('/health')
def health():
    """Quick health check — returns which cameras are currently streaming."""
    with _lock:
        active = list(_frame_store.keys())
    payload = {'ok': True, 'service': 'ai-worker', 'streaming_cameras': active}
    if _health_provider:
        payload.update(_health_provider())
    return payload


def start(port: int = 5001):
    """Start the Flask MJPEG server in a background daemon thread."""
    def _run():
        # Suppress Flask's default startup banner
        import logging
        log = logging.getLogger('werkzeug')
        log.setLevel(logging.ERROR)
        app.run(host='0.0.0.0', port=port, threaded=True, use_reloader=False)

    t = threading.Thread(target=_run, daemon=True, name='mjpeg-server')
    t.start()
    print(f"[MJPEG] Stream server running → http://localhost:{port}/stream/<camera_id>")
