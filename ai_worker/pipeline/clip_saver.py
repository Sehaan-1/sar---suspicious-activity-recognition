"""
clip_saver.py — Ring-buffer video clip and thumbnail saver.

Maintains a rolling buffer of the last N frames. When an event is detected,
saves the buffered frames as a pre-event MP4 clip and a JPEG thumbnail.
Writing is done in a background thread so it never blocks the inference loop.
"""

import cv2
import os
import threading
from collections import deque

CLIPS_DIR = os.environ.get('CLIPS_DIR', os.path.join(os.path.dirname(__file__), '..', '..', 'media', 'clips'))
THUMBS_DIR = os.environ.get('THUMBS_DIR', os.path.join(os.path.dirname(__file__), '..', '..', 'media', 'thumbs'))

os.makedirs(CLIPS_DIR, exist_ok=True)
os.makedirs(THUMBS_DIR, exist_ok=True)


class ClipSaver:
    def __init__(self, camera_id: int, fps: int = 15, buffer_seconds: int = 10):
        """
        Args:
            camera_id:      Used to namespace output filenames.
            fps:            Frames per second of the source stream.
            buffer_seconds: How many seconds of pre-event footage to keep.
        """
        self.camera_id = camera_id
        self.fps = fps
        self.buffer: deque = deque(maxlen=fps * buffer_seconds)

    def add_frame(self, frame):
        """Push a frame into the ring buffer. Call this on every captured frame."""
        self.buffer.append(frame.copy())

    def save(self, event_id: int) -> tuple[str | None, str | None]:
        """
        Save the current ring buffer as a video clip + a mid-point thumbnail.

        Args:
            event_id: Used as the filename stem (e.g. event 42 → '42.mp4').

        Returns:
            (clip_path, thumb_path) — absolute paths, or (None, None) if buffer empty.
        """
        frames = list(self.buffer)
        if not frames:
            return None, None

        clip_path  = os.path.abspath(os.path.join(CLIPS_DIR,  f'{event_id}.mp4'))
        thumb_path = os.path.abspath(os.path.join(THUMBS_DIR, f'{event_id}.jpg'))

        # Save thumbnail synchronously (fast — single frame)
        mid_frame = frames[len(frames) // 2]
        cv2.imwrite(thumb_path, mid_frame)

        # Write video clip in a background thread (non-blocking)
        def _write_clip(frames_snapshot):
            h, w = frames_snapshot[0].shape[:2]
            # H.264 (avc1) is the only codec browsers can natively play.
            # mp4v / MPEG-4 Part 2 produces files browsers cannot decode.
            fourcc = cv2.VideoWriter_fourcc(*'avc1')
            writer = cv2.VideoWriter(clip_path, fourcc, self.fps, (w, h))
            if not writer.isOpened():
                # Fallback: some OpenCV Windows builds lack the H.264 encoder.
                # Try mp4v which still uses the mp4 container and often works on Windows OpenCV builds.
                fourcc = cv2.VideoWriter_fourcc(*'mp4v')
                writer = cv2.VideoWriter(clip_path, fourcc, self.fps, (w, h))
            for f in frames_snapshot:
                writer.write(f)
            writer.release()
            print(f"    [ClipSaver] Clip saved → {clip_path}")

        threading.Thread(target=_write_clip, args=(frames,), daemon=True).start()

        return clip_path, thumb_path
