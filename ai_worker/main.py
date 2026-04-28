import cv2
import time
import requests
import json
from datetime import datetime

# NOTE: Legacy demo script only.
# Docker and production-like runs use ai_worker/worker.py, which contains the
# dynamic multi-camera worker. Keep this file around only as a small mock example.

API_URL = "http://localhost:3000/api/ingest/event"

class SARWorker:
    def __init__(self, camera_id, source_url):
        self.camera_id = camera_id
        self.source_url = source_url
        print(f"[{camera_id}] Initializing YOLOv8 and ByteTrack...")
        # self.model = YOLO('yolov8s.pt')
        # self.tracker = ByteTrack()

    def process_frame(self, frame):
        # 1. Run YOLO detection
        # results = self.model(frame)
        
        # 2. Update Tracker
        # tracks = self.tracker.update(results)
        
        # 3. Apply Heuristics (e.g. Loitering)
        # if check_loitering(tracks):
        #     self.trigger_alert("LOITERING", "MEDIUM", 0.85, tracks)
        pass

    def trigger_alert(self, activity_type, severity, confidence, bbox):
        payload = {
            "camera_id": self.camera_id,
            "activity_type": activity_type,
            "severity": severity,
            "confidence": confidence,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "bounding_boxes": bbox,
            "metadata": { "trigger": "rules_engine" }
        }
        
        try:
            res = requests.post(API_URL, json=payload)
            print(f"[{self.camera_id}] Alert sent: {activity_type} - {res.status_code}")
        except Exception as e:
            print(f"[{self.camera_id}] Failed to send alert: {e}")

    def run(self):
        print(f"[{self.camera_id}] Connecting to video stream: {self.source_url}")
        # cap = cv2.VideoCapture(self.source_url)
        # while cap.isOpened():
        #     ret, frame = cap.read()
        #     if not ret: break
        #     self.process_frame(frame)
        print("Worker mock loop running. Use the dashboard to simulate events.")

if __name__ == "__main__":
    worker = SARWorker(1, "rtsp://internal/main-gate")
    worker.run()
