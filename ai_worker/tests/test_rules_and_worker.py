import os
import sys
import time
import unittest
from unittest.mock import patch

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

from pipeline.rules import RulesEngine, CONFIRM_FRAMES, SHAPELY_AVAILABLE


class RulesEngineTests(unittest.TestCase):
    def person(self, track_id=1, bbox=None):
        return {
            'track_id': track_id,
            'label': 'person',
            'bbox': bbox or [10, 10, 60, 100],
            'confidence': 0.9,
        }

    def bag(self, track_id=2, bbox=None):
        return {
            'track_id': track_id,
            'label': 'backpack',
            'bbox': bbox or [300, 300, 340, 360],
            'confidence': 0.85,
        }

    def test_loitering_threshold_emits_alert_after_confirmation(self):
        engine = RulesEngine({'camera_id': 1}, {'loitering_seconds': 0})
        alert = []
        for _ in range(45):
            alert = engine.process([self.person()])
            if alert:
                break
            time.sleep(0.001)

        self.assertTrue(alert)
        self.assertEqual(alert[0]['activity_type'], 'LOITERING')

    def test_roi_trespassing_detects_person_inside_polygon(self):
        if not SHAPELY_AVAILABLE:
            self.skipTest('shapely is not installed in this Python environment')
        engine = RulesEngine(
            {'camera_id': 1, 'roi_polygon': [[0, 0], [100, 0], [100, 100], [0, 100]]},
            {},
        )
        alert = []
        for _ in range(CONFIRM_FRAMES):
            alert = engine.process([self.person()])

        self.assertTrue(alert)
        self.assertEqual(alert[0]['activity_type'], 'TRESPASSING')

    @patch('pipeline.rules.BAG_THRESHOLD_SEC', 0)
    def test_unattended_bag_emits_alert_after_confirmation(self):
        engine = RulesEngine({'camera_id': 1}, {})
        alert = []
        for _ in range(CONFIRM_FRAMES):
            alert = engine.process([self.bag()])

        self.assertTrue(alert)
        self.assertEqual(alert[0]['activity_type'], 'UNATTENDED_BAG')


class WorkerContractTests(unittest.TestCase):
    def test_worker_defaults_are_cpu_friendly(self):
        worker_path = os.path.join(ROOT, 'worker.py')
        with open(worker_path, 'r', encoding='utf8') as fh:
            source = fh.read()

        self.assertIn("YOLO_MODEL', 'yolov8n.pt'", source)
        self.assertIn("TARGET_FPS', '3'", source)
        self.assertIn('def health_payload()', source)
        self.assertIn('def inference_loop(', source)


if __name__ == '__main__':
    unittest.main()
