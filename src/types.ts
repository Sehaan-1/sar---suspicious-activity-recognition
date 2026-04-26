export interface Camera {
  camera_id: number;
  name: string;
  source_url: string;
  location: string;
  status: string;
  roi_polygon?: string;
}

export interface Event {
  event_id: number;
  camera_id: number;
  camera_name?: string;
  activity_type: string;
  severity: string;
  confidence: number;
  timestamp: string;
  thumbnail_path?: string;
  clip_path?: string;
  bounding_boxes?: string;
  metadata?: string;
  status: string;
  created_at: string;
}
