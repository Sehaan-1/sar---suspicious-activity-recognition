import Database from 'better-sqlite3';
import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = path.join(__dirname, 'sar.db');
const db = new Database(dbPath);

// Initialize schema
db.exec(`
  CREATE TABLE IF NOT EXISTS cameras (
    camera_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    location TEXT,
    status TEXT DEFAULT 'ACTIVE',
    roi_polygon TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    camera_id INTEGER REFERENCES cameras(camera_id),
    activity_type TEXT NOT NULL,
    severity TEXT,
    confidence REAL,
    timestamp DATETIME NOT NULL,
    thumbnail_path TEXT,
    clip_path TEXT,
    bounding_boxes TEXT,
    metadata TEXT,
    status TEXT DEFAULT 'UNREAD',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    user_id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'OPERATOR',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
`);

// Insert default cameras if empty
const count = db.prepare('SELECT COUNT(*) as count FROM cameras').get() as { count: number };
if (count.count === 0) {
  const insertCamera = db.prepare('INSERT INTO cameras (name, source_url, location) VALUES (?, ?, ?)');
  insertCamera.run('Main Gate', 'rtsp://internal/main-gate', 'Entrance');
  insertCamera.run('Lobby', 'rtsp://internal/lobby', 'Lobby');
  insertCamera.run('Back Alley', 'rtsp://internal/alley', 'Loading Dock');
  insertCamera.run('Cafeteria', 'rtsp://internal/cafe', 'Cafeteria');
}

// Seed default admin user if users table is empty
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
if (userCount.count === 0) {
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  const adminPassword = process.env.ADMIN_PASSWORD?.trim();

  if (adminEmail && adminPassword) {
    const hash = bcrypt.hashSync(adminPassword, 10);
    db.prepare('INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?)')
      .run(adminEmail, hash, 'ADMIN');
    console.log(`[DB] Initial admin seeded for ${adminEmail}`);
  } else {
    console.warn('[DB] No users exist. Set ADMIN_EMAIL and ADMIN_PASSWORD to seed the initial admin account.');
  }
}

export default db;
