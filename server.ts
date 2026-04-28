import express from 'express';
import 'dotenv/config';
import { createServer, request as httpRequest } from 'http';
import { Server } from 'socket.io';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import db from './server/db.js';
import { requireEnv, validateRequiredEnv } from './server/env.js';
import { ensureRuntimeDirs, getConfigPath, getMediaPath } from './server/paths.js';
import net from 'net';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  validateRequiredEnv();
  ensureRuntimeDirs();

  const app = express();
  const server = createServer(app);
  const io = new Server(server, { path: '/socket.io' });
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

  app.use(express.json());

  const mediaPath = getMediaPath();
  app.use('/media', express.static(mediaPath));
  const workerStreamBase = process.env.WORKER_STREAM_BASE || 'http://localhost:5001';

  // --- Automated Media Cleanup ---
  const MAX_STORAGE_DAYS = Number(process.env.CLEANUP_MAX_AGE_DAYS || 30);
  function cleanupOldEvents() {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - MAX_STORAGE_DAYS);
      const cutoffIso = cutoffDate.toISOString();

      const oldEvents = db.prepare('SELECT event_id, thumbnail_path, clip_path FROM events WHERE timestamp < ?').all(cutoffIso) as any[];
      if (oldEvents.length === 0) return;

      console.log(`[Cleanup] Found ${oldEvents.length} events older than ${MAX_STORAGE_DAYS} days.`);

      for (const event of oldEvents) {
        try {
          if (event.thumbnail_path) {
            const thumbName = path.basename(event.thumbnail_path);
            const thumbAbsPath = path.join(mediaPath, 'thumbs', thumbName);
            if (fs.existsSync(thumbAbsPath)) fs.unlinkSync(thumbAbsPath);
          }
          if (event.clip_path) {
            const clipName = path.basename(event.clip_path);
            const clipAbsPath = path.join(mediaPath, 'clips', clipName);
            if (fs.existsSync(clipAbsPath)) fs.unlinkSync(clipAbsPath);
          }
        } catch (e) {
          console.error(`[Cleanup] Failed to delete files for event ${event.event_id}`, e);
        }
      }

      db.prepare('DELETE FROM events WHERE timestamp < ?').run(cutoffIso);
      console.log(`[Cleanup] Successfully removed ${oldEvents.length} events from database.`);
    } catch (err) {
      console.error('[Cleanup] Error running cleanup task', err);
    }
  }

  // Run cleanup 10 seconds after startup, then every 24 hours
  setTimeout(cleanupOldEvents, 10000);
  setInterval(cleanupOldEvents, 24 * 60 * 60 * 1000);

  const JWT_SECRET = requireEnv('JWT_SECRET');
  const JWT_EXPIRES = '24h';
  const INGEST_API_KEY = requireEnv('INGEST_API_KEY');

  // --- Auth Middleware ---
  function requireAuth(req: any, res: any, next: any) {
    const token = req.headers['authorization']?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Access token required' });
    try {
      req.user = jwt.verify(token, JWT_SECRET);
      next();
    } catch {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  }

  /** Validates the X-API-Key header — used by the AI worker. */
  function requireApiKey(req: any, res: any, next: any) {
    const key = req.headers['x-api-key'];
    if (!key || key !== INGEST_API_KEY) {
      return res.status(403).json({ error: 'Invalid or missing API key' });
    }
    next();
  }

  /** Accepts EITHER a valid JWT (browser) OR a valid X-API-Key (AI worker). */
  function requireAuthOrApiKey(req: any, res: any, next: any) {
    // Try API key first (fast path for AI worker)
    if (req.headers['x-api-key'] === INGEST_API_KEY) return next();
    // Fall back to JWT
    requireAuth(req, res, next);
  }

  // --- API Routes ---

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, service: 'backend', timestamp: new Date().toISOString() });
  });

  // POST /api/auth/login — public (no auth required)
  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: 'Email and password required' });

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as any;
    if (!user || !bcrypt.compareSync(password, user.password_hash))
      return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { user_id: user.user_id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES }
    );

    res.json({
      token,
      user: { user_id: user.user_id, email: user.email, role: user.role },
    });
  });

  // Cameras — accessible via JWT (browser) or API key (AI worker)
  app.get('/api/cameras', requireAuthOrApiKey, (req, res) => {
    const cameras = db.prepare('SELECT * FROM cameras').all();
    res.json(cameras);
  });

  const cameraSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    source_url: z.string().min(1, "Stream source is required"),
    location: z.string().optional()
  });

  app.post('/api/cameras', requireAuth, async (req, res) => {
    try {
      const { name, source_url, location } = cameraSchema.parse(req.body);

      // Case 1: Local webcam index (e.g. "0", "1")
      const isLocalWebcam = /^\d+$/.test(source_url.trim());

      if (!isLocalWebcam) {
        // Case 2: RTSP — native URL() doesn't support rtsp:// so we parse manually
        const isRtsp = source_url.toLowerCase().startsWith('rtsp://');

        let host: string;
        let port: number;

        if (isRtsp) {
          // Manual parse: rtsp://[user:pass@]host[:port]/path
          const withoutScheme = source_url.slice(7); // strip 'rtsp://'
          const atIndex = withoutScheme.indexOf('@');
          const hostPart = atIndex >= 0 ? withoutScheme.slice(atIndex + 1) : withoutScheme;
          const slashIndex = hostPart.indexOf('/');
          const hostAndPort = slashIndex >= 0 ? hostPart.slice(0, slashIndex) : hostPart;
          const colonIndex = hostAndPort.lastIndexOf(':');
          if (colonIndex >= 0) {
            host = hostAndPort.slice(0, colonIndex);
            port = parseInt(hostAndPort.slice(colonIndex + 1)) || 554;
          } else {
            host = hostAndPort;
            port = 554;
          }
        } else {
          // Case 3: HTTP/HTTPS — use native URL()
          let parsedUrl: URL;
          try {
            parsedUrl = new URL(source_url);
          } catch {
            return res.status(400).json({ error: 'Invalid URL format. Use rtsp://, http://, https://, or a webcam index (0, 1...).' });
          }
          host = parsedUrl.hostname;
          port = parseInt(parsedUrl.port) || (parsedUrl.protocol === 'https:' ? 443 : 80);
        }

        // Skip TCP ping for localhost / private network streams to speed up demo
        const isLocal = host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168') || host.startsWith('10.') || !host.includes('.');

        if (!isLocal) {
          const isReachable = await new Promise<boolean>((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(3000);
            socket.on('connect', () => { socket.destroy(); resolve(true); });
            socket.on('timeout', () => { socket.destroy(); resolve(false); });
            socket.on('error', () => resolve(false));
            socket.connect(port, host);
          });

          if (!isReachable) {
            return res.status(400).json({ error: `Stream unreachable at ${host}:${port}. Verify the URL or IP address.` });
          }
        }
      }

      const stmt = db.prepare('INSERT INTO cameras (name, source_url, location, status) VALUES (?, ?, ?, ?)');
      const info = stmt.run(name, source_url.trim(), location ?? null, 'ACTIVE');
      res.json({ id: info.lastInsertRowid, status: 'ACTIVE' });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        res.status(400).json({ error: err.issues[0]?.message || 'Invalid camera payload' });
      } else {
        console.error('[POST /api/cameras]', err);
        res.status(500).json({ error: 'Internal Server Error' });
      }
    }
  });

  app.delete('/api/cameras/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM cameras WHERE camera_id = ?').run(req.params.id);
    res.json({ success: true });
  });

  app.patch('/api/cameras/:id/roi', requireAuth, (req, res) => {
    const { roi_polygon } = req.body;
    db.prepare('UPDATE cameras SET roi_polygon = ? WHERE camera_id = ?').run(roi_polygon, req.params.id);
    res.json({ success: true });
  });

  const cameraStatusSchema = z.object({
    status: z.enum(['ACTIVE', 'ONLINE', 'OFFLINE', 'RETRYING', 'DISABLED']),
  });

  app.patch('/api/cameras/:id/status', requireApiKey, (req, res) => {
    try {
      const { status } = cameraStatusSchema.parse(req.body);
      db.prepare('UPDATE cameras SET status = ? WHERE camera_id = ?').run(status, req.params.id);
      res.json({ success: true, status });
    } catch (err: any) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({ error: err.issues[0]?.message || 'Invalid camera status' });
      }
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/stream/:cameraId', (req, res) => {
    const upstreamUrl = new URL(`/stream/${req.params.cameraId}`, workerStreamBase);
    const upstream = httpRequest(upstreamUrl, (upstreamRes) => {
      res.writeHead(upstreamRes.statusCode || 200, {
        'Content-Type': upstreamRes.headers['content-type'] || 'multipart/x-mixed-replace; boundary=frame',
        'Cache-Control': 'no-store',
      });
      upstreamRes.pipe(res);
    });

    upstream.on('error', () => {
      if (!res.headersSent) {
        res.status(503).json({ error: 'Stream unavailable' });
      } else {
        res.end();
      }
    });

    req.on('close', () => upstream.destroy());
    upstream.end();
  });

  // Events
  app.get('/api/events', requireAuth, (req, res) => {
    const { camera_id, activity, from, to, limit = 50 } = req.query;
    let query = 'SELECT events.*, cameras.name as camera_name FROM events LEFT JOIN cameras ON events.camera_id = cameras.camera_id';
    const params: any[] = [];
    const conditions: string[] = [];

    if (camera_id) {
      conditions.push('events.camera_id = ?');
      params.push(camera_id);
    }
    if (activity) {
      conditions.push('events.activity_type = ?');
      params.push(activity);
    }
    if (from) {
      conditions.push('events.timestamp >= ?');
      params.push(from);
    }
    if (to) {
      const toStr = to as string;
      // If it's just a date (YYYY-MM-DD), append time to cover the whole day
      const toDate = toStr.includes('T') ? toStr : `${toStr}T23:59:59.999Z`;
      conditions.push('events.timestamp <= ?');
      params.push(toDate);
    }

    if (conditions.length > 0) {
      query += ' WHERE ' + conditions.join(' AND ');
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(Number(limit));

    const events = db.prepare(query).all(...params);
    res.json(events);
  });

  app.get('/api/events/:id', requireAuth, (req, res) => {
    const event = db.prepare('SELECT events.*, cameras.name as camera_name FROM events LEFT JOIN cameras ON events.camera_id = cameras.camera_id WHERE event_id = ?').get(req.params.id);
    res.json(event);
  });

  app.patch('/api/events/:id', requireAuth, (req, res) => {
    const { status, thumbnail_path, clip_path } = req.body;
    const fields: string[] = [];
    const params: any[] = [];

    if (status !== undefined) { fields.push('status = ?'); params.push(status); }
    if (thumbnail_path !== undefined) { fields.push('thumbnail_path = ?'); params.push(thumbnail_path); }
    if (clip_path !== undefined) { fields.push('clip_path = ?'); params.push(clip_path); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(req.params.id);
    db.prepare(`UPDATE events SET ${fields.join(', ')} WHERE event_id = ?`).run(...params);
    res.json({ success: true });
  });

  app.delete('/api/events/:id', requireAuth, (req, res) => {
    db.prepare('DELETE FROM events WHERE event_id = ?').run(req.params.id);
    res.json({ success: true });
  });

  // Bulk delete — body: { ids: number[] }
  app.delete('/api/events', requireAuth, (req, res) => {
    const { ids } = req.body as { ids: number[] };
    if (!Array.isArray(ids) || ids.length === 0)
      return res.status(400).json({ error: 'ids array required' });
    const placeholders = ids.map(() => '?').join(', ');
    db.prepare(`DELETE FROM events WHERE event_id IN (${placeholders})`).run(...ids);
    res.json({ success: true, deleted: ids.length });
  });

  app.get('/api/dashboard/summary', requireAuth, (req, res) => {
    const total = db.prepare('SELECT COUNT(*) as count FROM events').get() as { count: number };
    const byType = db.prepare('SELECT activity_type, COUNT(*) as count FROM events GROUP BY activity_type').all();
    res.json({ total: total.count, byType });
  });

  app.get('/api/dashboard/events-per-day', requireAuth, (req, res) => {
    try {
      const { startDate, endDate, cameraId, eventType } = req.query;

      const conditions: string[] = [];
      const params: any[] = [];

      if (startDate) {
        conditions.push('timestamp >= ?');
        params.push(startDate);
      }
      if (endDate) {
        const toStr = endDate as string;
        const toDate = toStr.includes('T') ? toStr : `${toStr}T23:59:59.999Z`;
        conditions.push('timestamp <= ?');
        params.push(toDate);
      }
      if (cameraId) {
        conditions.push('camera_id = ?');
        params.push(cameraId);
      }
      if (eventType) {
        conditions.push('activity_type = ?');
        params.push(eventType);
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Use localtime to handle timezone offset properly
      const query = `
        SELECT date(timestamp, 'localtime') as day, COUNT(*) as count 
        FROM events 
        ${whereClause} 
        GROUP BY day 
        ORDER BY day ASC
      `;

      const results = db.prepare(query).all(...params) as { day: string, count: number }[];

      // Zero Padding Logic
      let startStr = startDate as string;
      let endStr = endDate as string;

      if (!startStr && results.length > 0) startStr = results[0].day;
      if (!endStr && results.length > 0) endStr = results[results.length - 1].day;
      if (!startStr || !endStr) return res.json([]);

      const padStart = new Date(startStr + 'T00:00:00');
      const padEnd = new Date(endStr + 'T00:00:00');

      // Ensure the end loop captures the actual end date
      const paddedData: { date: string, count: number }[] = [];

      for (let d = new Date(padStart); d <= padEnd; d.setDate(d.getDate() + 1)) {
        // Use local date to match SQLite's 'localtime' output
        const dayStr = d.getFullYear() + '-' +
          String(d.getMonth() + 1).padStart(2, '0') + '-' +
          String(d.getDate()).padStart(2, '0');
        const existing = results.find(r => r.day === dayStr);
        paddedData.push({
          date: dayStr,
          count: existing ? existing.count : 0
        });
      }

      res.json(paddedData);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Settings config — read/write a JSON file on disk
  const CONFIG_PATH = getConfigPath();

  app.get('/api/config', requireAuthOrApiKey, (req, res) => {
    try {
      const raw = fs.existsSync(CONFIG_PATH) ? fs.readFileSync(CONFIG_PATH, 'utf8') : '{}';
      res.json(JSON.parse(raw));
    } catch {
      res.json({});
    }
  });

  app.put('/api/config', requireAuth, (req, res) => {
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(req.body, null, 2));
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // AI Ingestion Endpoint - Used by the Python worker (API-key protected)
  app.post('/api/ingest/event', requireApiKey, (req, res) => {
    const data = req.body;
    const stmt = db.prepare(`
      INSERT INTO events (camera_id, activity_type, severity, confidence, timestamp, bounding_boxes, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const info = stmt.run(
      data.camera_id,
      data.activity_type,
      data.severity,
      data.confidence,
      data.timestamp || new Date().toISOString(),
      JSON.stringify(data.bounding_boxes || []),
      JSON.stringify(data.metadata || {})
    );

    const newEvent = { ...data, event_id: info.lastInsertRowid };

    // Broadcast to dashboard
    io.emit('NEW_ALERT', newEvent);

    res.json({ success: true, event_id: info.lastInsertRowid });
  });

  // Simulate endpoint — JWT-protected so the Dashboard "Simulate Event" button works
  app.post('/api/simulate/event', requireAuth, (req, res) => {
    const data = req.body;
    const stmt = db.prepare(`
      INSERT INTO events (camera_id, activity_type, severity, confidence, timestamp, bounding_boxes, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const timestamp = data.timestamp || new Date().toISOString();
    const info = stmt.run(
      data.camera_id,
      data.activity_type,
      data.severity,
      data.confidence,
      timestamp,
      JSON.stringify(data.bounding_boxes || []),
      JSON.stringify(data.metadata || {})
    );
    const newEvent = { ...data, event_id: info.lastInsertRowid, timestamp };
    io.emit('NEW_ALERT', newEvent);
    res.json({ success: true, event_id: info.lastInsertRowid });
  });

  // AI worker — update clip/thumbnail paths after saving to disk (API-key protected)
  app.patch('/api/ingest/event/:id/media', requireApiKey, (req, res) => {
    const { thumbnail_path, clip_path } = req.body;
    const fields: string[] = [];
    const params: any[] = [];

    if (thumbnail_path !== undefined) { fields.push('thumbnail_path = ?'); params.push(thumbnail_path); }
    if (clip_path !== undefined) { fields.push('clip_path = ?'); params.push(clip_path); }

    if (fields.length === 0) return res.status(400).json({ error: 'No fields' });

    params.push(req.params.id);
    db.prepare(`UPDATE events SET ${fields.join(', ')} WHERE event_id = ?`).run(...params);
    res.json({ success: true });
  });

  // WebSockets
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
    });
  });

  // Vite Integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = __dirname;
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
