"""
detector.py — YOLOv8 + ByteTrack wrapper.

Loads a YOLOv8 model once and exposes a single detect(frame) method.
ByteTrack is activated internally by Ultralytics via model.track(persist=True).
"""

from ultralytics import YOLO

# COCO class IDs we care about for SAR
TRACKED_CLASSES = {
    0:  'person',
    24: 'backpack',
    26: 'handbag',
    28: 'suitcase',
}


class Detector:
    def __init__(self, model_name: str = 'yolov8s.pt', confidence: float = 0.45, device: str = 'cpu'):
        """
        Args:
            model_name: 'yolov8n.pt' (fastest/CPU) | 'yolov8s.pt' (balanced) | 'yolov8m.pt' (accurate)
            confidence: Minimum detection confidence (0.0 – 1.0)
            device:     'cpu' | 'cuda' | '0'  (first GPU index)
        """
        print(f"[Detector] Loading {model_name} on {device} ...")
        self.model = YOLO(model_name)
        self.confidence = confidence
        self.device = device
        print("[Detector] Model ready.")

    def detect(self, frame) -> list[dict]:
        """
        Run detection + ByteTrack tracking on a single BGR frame (numpy array).

        Returns a list of dicts:
            {
                'track_id':   int,
                'label':      str,       # 'person' | 'backpack' | 'handbag' | 'suitcase'
                'bbox':       [x1,y1,x2,y2],
                'confidence': float,
            }
        """
        # persist=True tells Ultralytics to keep ByteTrack state between calls
        results = self.model.track(
            frame,
            persist=True,
            conf=self.confidence,
            device=self.device,
            classes=list(TRACKED_CLASSES.keys()),
            verbose=False,
        )

        detections: list[dict] = []

        if not results or results[0].boxes is None:
            return detections

        boxes = results[0].boxes
        for box in boxes:
            cls_id = int(box.cls[0])
            if cls_id not in TRACKED_CLASSES:
                continue

            # track_id is None when ByteTrack hasn't assigned one yet
            track_id = int(box.id[0]) if box.id is not None else -1
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            conf = float(box.conf[0])

            detections.append({
                'track_id':   track_id,
                'label':      TRACKED_CLASSES[cls_id],
                'bbox':       [x1, y1, x2, y2],
                'confidence': round(conf, 4),
            })

        return detections
