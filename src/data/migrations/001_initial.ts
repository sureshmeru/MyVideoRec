export const INITIAL_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS recordings (
    id TEXT PRIMARY KEY NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    camera_id TEXT NOT NULL,
    camera_position TEXT NOT NULL,
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    frame_rate REAL NOT NULL,
    duration_seconds REAL NOT NULL,
    file_size_bytes INTEGER NOT NULL,
    local_uri TEXT NOT NULL UNIQUE,
    is_protected INTEGER NOT NULL DEFAULT 0,
    gps_latitude REAL,
    gps_longitude REAL,
    upload_status TEXT NOT NULL DEFAULT 'not-uploaded'
  )`,
  'CREATE INDEX IF NOT EXISTS recordings_start_time_idx ON recordings(start_time DESC)',
  'CREATE INDEX IF NOT EXISTS recordings_upload_status_idx ON recordings(upload_status)',
  `CREATE TABLE IF NOT EXISTS upload_jobs (
    id TEXT PRIMARY KEY NOT NULL,
    recording_id TEXT NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
    provider_id TEXT NOT NULL,
    remote_id TEXT,
    state TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(recording_id, provider_id)
  )`,
  `CREATE TABLE IF NOT EXISTS trips (
    id TEXT PRIMARY KEY NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    distance_meters REAL NOT NULL DEFAULT 0
  )`,
  `CREATE TABLE IF NOT EXISTS trip_points (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    recorded_at TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    speed_mps REAL,
    accuracy_m REAL
  )`,
];
