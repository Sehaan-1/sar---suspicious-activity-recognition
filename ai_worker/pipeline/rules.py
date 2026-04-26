"""
rules.py — Stateful activity detection rules engine.

Maintains per-track state across frames and fires alerts when:
  - LOITERING:       A person stays in the frame / ROI > threshold seconds with minimal movement.
  - TRESPASSING:     A person enters a defined restricted ROI polygon.
  - UNATTENDED_BAG:  A bag is left alone (no person nearby) for > threshold seconds.

Design decisions:
  - CONFIRM_FRAMES:  A condition must hold for N consecutive frames before firing.
                     Prevents single-frame false positives.
  - COOLDOWN_SECS:   Minimum seconds between repeated alerts for the same track_id + activity.
                     Prevents alert spam when a condition persists.
  - shapely.geometry: Used for robust polygon point-in-polygon test (ROI zones).
"""

import time
import math
from dataclasses import dataclass, field

try:
    from shapely.geometry import Point, Polygon as ShapelyPolygon
    SHAPELY_AVAILABLE = True
except ImportError:
    SHAPELY_AVAILABLE = False
    print("[Rules] WARNING: shapely not installed. Trespassing detection disabled. Run: pip install shapely")

# --- Tuneable constants ---
CONFIRM_FRAMES     = 15    # Consecutive frames a condition must hold before alert fires (~1s at 15fps)
COOLDOWN_SECS      = 30    # Seconds before re-alerting the same track on the same activity
MAX_POSITION_HIST  = 300   # Frames of position history to keep per track (~20s at 15fps)

LOITER_THRESHOLD_SEC   = 60    # Seconds in frame before loitering alert
LOITER_MOVEMENT_PX     = 50    # If person moves less than this in last 30 frames → "stationary"
BAG_THRESHOLD_SEC      = 60    # Seconds a bag must be unattended before alert
BAG_OWNER_RADIUS_PX    = 150   # Pixel radius within which a person is considered "owner"


@dataclass
class TrackState:
    track_id: int
    first_seen: float = field(default_factory=time.time)
    # List of (cx, cy, timestamp) tuples — position history
    positions: list = field(default_factory=list)
    # activity_type -> last alert timestamp
    last_alert_time: dict = field(default_factory=dict)
    # For bag tracking: when it was last seen without a nearby person
    alone_since: float | None = None


def _center(bbox: list[int]) -> tuple[int, int]:
    x1, y1, x2, y2 = bbox
    return (x1 + x2) // 2, (y1 + y2) // 2


def _dist(p1: tuple, p2: tuple) -> float:
    return math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2)


class RulesEngine:
    def __init__(self, camera_config: dict, sys_config: dict = None):
        """
        Args:
            camera_config: Row from the cameras table.
                           Must have 'camera_id'.
                           Optionally has 'roi_polygon': [[x,y], [x,y], ...]
                           (the restricted/trespassing zone for this camera).
            sys_config:    System-wide AI configuration from settings.
        """
        if sys_config is None:
            sys_config = {}
            
        self.camera_id: int = camera_config['camera_id']
        
        # Override defaults with system config
        self.loiter_threshold = sys_config.get('loitering_seconds', LOITER_THRESHOLD_SEC)
        bag_radius_m = sys_config.get('unattended_bag_radius', 2.5)
        self.bag_radius_px = int(bag_radius_m * 60) # roughly 60px per meter

        # Per-track state memory
        self._states: dict[int, TrackState] = {}
        # (track_id, activity) -> consecutive frame count
        self._frame_counts: dict[tuple, int] = {}

        # Parse ROI polygon for trespassing detection
        self._roi: 'ShapelyPolygon | None' = None
        raw_roi = camera_config.get('roi_polygon')
        if raw_roi and SHAPELY_AVAILABLE:
            try:
                coords = raw_roi if isinstance(raw_roi, list) else __import__('json').loads(raw_roi)
                if len(coords) >= 3:
                    self._roi = ShapelyPolygon(coords)
                    print(f"[Rules] Cam {self.camera_id}: ROI polygon loaded ({len(coords)} vertices).")
            except Exception as e:
                print(f"[Rules] Cam {self.camera_id}: Could not parse ROI polygon: {e}")

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def process(self, detections: list[dict]) -> list[dict]:
        """
        Process one frame's detections and return a list of alert dicts.

        Args:
            detections: Output from Detector.detect()

        Returns:
            List of alert payloads ready to POST to /api/ingest/event.
            Each dict has: activity_type, severity, confidence, bounding_boxes, metadata.
        """
        now = time.time()
        alerts: list[dict] = []

        persons = [d for d in detections if d['label'] == 'person']
        bags    = [d for d in detections if d['label'] in ('backpack', 'handbag', 'suitcase')]

        active_ids = {d['track_id'] for d in detections}

        # Update position history for persons
        for det in persons:
            tid = det['track_id']
            if tid < 0:
                continue
            state = self._states.setdefault(tid, TrackState(track_id=tid))
            cx, cy = _center(det['bbox'])
            state.positions.append((cx, cy, now))
            # Trim history
            if len(state.positions) > MAX_POSITION_HIST:
                state.positions = state.positions[-MAX_POSITION_HIST:]

        # Evict stale tracks from memory
        for tid in list(self._states.keys()):
            if tid not in active_ids:
                del self._states[tid]
                for rule in ('LOITERING', 'TRESPASSING', 'UNATTENDED_BAG'):
                    self._frame_counts.pop((tid, rule), None)

        # --- Run each rule ---
        alerts += self._check_loitering(persons, now)
        alerts += self._check_trespassing(persons, now)
        alerts += self._check_unattended_bag(bags, persons, now)

        return alerts

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _can_alert(self, track_id: int, activity: str) -> bool:
        state = self._states.get(track_id)
        if not state:
            return True
        last = state.last_alert_time.get(activity, 0)
        return (time.time() - last) >= COOLDOWN_SECS

    def _record_alert(self, track_id: int, activity: str):
        state = self._states.get(track_id)
        if state:
            state.last_alert_time[activity] = time.time()

    def _tick(self, track_id: int, rule: str) -> int:
        """Increment consecutive-frame counter. Returns new count."""
        key = (track_id, rule)
        self._frame_counts[key] = self._frame_counts.get(key, 0) + 1
        return self._frame_counts[key]

    def _reset(self, track_id: int, rule: str):
        self._frame_counts.pop((track_id, rule), None)

    # ------------------------------------------------------------------
    # Rule 1 — Loitering
    # ------------------------------------------------------------------

    def _check_loitering(self, persons: list[dict], now: float) -> list[dict]:
        alerts = []
        for det in persons:
            tid = det['track_id']
            if tid < 0:
                continue
            state = self._states.get(tid)
            if not state:
                continue

            duration = now - state.first_seen
            if duration < self.loiter_threshold:
                self._reset(tid, 'LOITERING')
                continue

            # Check movement: compare oldest and newest of the last 30 positions
            history = state.positions
            if len(history) < 30:
                continue

            oldest_pos = history[-30]
            newest_pos = history[-1]
            moved_px = _dist(oldest_pos[:2], newest_pos[:2])

            if moved_px < LOITER_MOVEMENT_PX:
                count = self._tick(tid, 'LOITERING')
                if count >= CONFIRM_FRAMES and self._can_alert(tid, 'LOITERING'):
                    self._record_alert(tid, 'LOITERING')
                    alerts.append({
                        'activity_type':  'LOITERING',
                        'severity':       'MEDIUM',
                        'confidence':     det['confidence'],
                        'bounding_boxes': [det],
                        'metadata': {
                            'duration_seconds': round(duration),
                            'movement_px':      round(moved_px, 1),
                            'track_id':         tid,
                        },
                    })
            else:
                self._reset(tid, 'LOITERING')

        return alerts

    # ------------------------------------------------------------------
    # Rule 2 — Trespassing (requires ROI polygon configured on camera)
    # ------------------------------------------------------------------

    def _check_trespassing(self, persons: list[dict], now: float) -> list[dict]:
        alerts = []
        if not self._roi:
            return alerts

        for det in persons:
            tid = det['track_id']
            if tid < 0:
                continue

            cx, cy = _center(det['bbox'])
            in_zone = self._roi.contains(Point(cx, cy))

            if in_zone:
                count = self._tick(tid, 'TRESPASSING')
                if count >= CONFIRM_FRAMES and self._can_alert(tid, 'TRESPASSING'):
                    self._record_alert(tid, 'TRESPASSING')
                    alerts.append({
                        'activity_type':  'TRESPASSING',
                        'severity':       'HIGH',
                        'confidence':     det['confidence'],
                        'bounding_boxes': [det],
                        'metadata': {
                            'zone':     'restricted',
                            'track_id': tid,
                        },
                    })
            else:
                self._reset(tid, 'TRESPASSING')

        return alerts

    # ------------------------------------------------------------------
    # Rule 3 — Unattended Bag
    # ------------------------------------------------------------------

    def _check_unattended_bag(self, bags: list[dict], persons: list[dict], now: float) -> list[dict]:
        alerts = []
        for bag in bags:
            tid = bag['track_id']
            if tid < 0:
                continue

            c1x, c1y = _center(bag['bbox'])

            # Is any person within the owner-proximity radius?
            person_nearby = False
            for p in persons:
                c2x, c2y = _center(p['bbox'])
                dist = math.hypot(c2x - c1x, c2y - c1y)
                if dist < self.bag_radius_px:
                    person_nearby = True
                    break

            if person_nearby:
                # Reset: owner is present
                self._reset(tid, 'UNATTENDED_BAG')
                state = self._states.get(tid)
                if state:
                    state.alone_since = None
                continue

            # No owner nearby — track how long
            state = self._states.setdefault(tid, TrackState(track_id=tid))
            if state.alone_since is None:
                state.alone_since = now

            alone_sec = now - state.alone_since
            if alone_sec >= BAG_THRESHOLD_SEC:
                count = self._tick(tid, 'UNATTENDED_BAG')
                if count >= CONFIRM_FRAMES and self._can_alert(tid, 'UNATTENDED_BAG'):
                    self._record_alert(tid, 'UNATTENDED_BAG')
                    alerts.append({
                        'activity_type':  'UNATTENDED_BAG',
                        'severity':       'HIGH',
                        'confidence':     bag['confidence'],
                        'bounding_boxes': [bag],
                        'metadata': {
                            'alone_seconds': round(alone_sec),
                            'track_id':      tid,
                        },
                    })

        return alerts
