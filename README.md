# 🔍 SAR — Suspicious Activity Recognition System

<div align="center">

![SAR Banner](https://img.shields.io/badge/SAR-Suspicious%20Activity%20Recognition-red?style=for-the-badge&logo=opencv&logoColor=white)

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB?style=flat-square&logo=python)](https://python.org/)
[![YOLOv8](https://img.shields.io/badge/YOLOv8-Ultralytics-00FFCC?style=flat-square&logo=yolo)](https://ultralytics.com/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?style=flat-square&logo=docker)](https://docker.com/)
[![Node.js](https://img.shields.io/badge/Node.js-Express-339933?style=flat-square&logo=node.js)](https://nodejs.org/)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

**A production-ready, AI-powered security surveillance system for real-time suspicious activity detection across multiple live video feeds.**

</div>

---

## 📸 Screenshots

**Main Dashboard** — Live camera feeds, real-time alert sidebar, and system health stats
![Dashboard](docs/screenshot-dashboard.png)

**Event Database** — Filterable, searchable log of all AI-detected incidents with snapshot thumbnails and CSV export
![Events](docs/screenshot-events.png)

**Analytics** — 7-day trend charts, event type breakdown, and KPI summary cards
![Analytics](docs/screenshot-analytics.png)

---

## ✨ Key Features

| Feature | Description |
|---------|-------------|
| 🎥 **Multi-Camera Processing** | Concurrent multi-threaded video stream analysis across unlimited cameras |
| 🧠 **YOLOv8 + ByteTrack** | State-of-the-art object detection + multi-object tracking pipeline |
| ⚡ **Sub-Second Alerts** | Real-time WebSocket event pushes — dashboard updates in < 1 second |
| 🔄 **Hot-Reload Camera Config** | Add/remove cameras live; AI worker spawns/kills inference threads with zero downtime |
| 🌐 **Web Stream Extraction** | `yt-dlp` integration extracts raw feeds from YouTube Live and 1000+ streaming platforms |
| 🗺️ **ROI Polygon Editor** | Draw custom regions-of-interest per camera; only trigger alerts within defined zones |
| 🧹 **Automated Storage Pruning** | Background routine purges clips, thumbnails & DB records older than 30 days |
| 📊 **Analytics Dashboard** | Historical incident charts, camera uptime stats, and event trend analysis |
| 🔐 **JWT Authentication** | Secure login with bcrypt password hashing and token-based session management |
| 🐳 **One-Command Deployment** | Fully containerized via Docker Compose — backend, frontend, and AI worker |

---

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Browser (React UI)                    │
│  Dashboard │ Live Feeds │ Events │ Analytics │ Settings  │
└──────────────────────┬──────────────────────────────────┘
                       │  REST API + WebSocket (Socket.IO)
┌──────────────────────▼──────────────────────────────────┐
│               Node.js / Express Backend                  │
│  • REST API (cameras, events, config)                    │
│  • JWT Auth + bcrypt                                     │
│  • SQLite via better-sqlite3                             │
│  • WebSocket broadcaster (Socket.IO)                     │
│  • Scheduled storage cleanup (30-day retention)          │
└──────────────────────┬──────────────────────────────────┘
                       │  HTTP polling + POST alerts
┌──────────────────────▼──────────────────────────────────┐
│               Python AI Worker                           │
│  • Dynamic camera thread manager (add/remove live)       │
│  • OpenCV frame capture → YOLOv8 inference               │
│  • ByteTrack multi-object tracking                       │
│  • Rule engine: ROI intersection, loiter timer, etc.     │
│  • MJPEG streaming server (Flask)                        │
│  • yt-dlp integration for web stream sources             │
└─────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack

**Frontend**
- React 19, TypeScript, Vite 6
- Tailwind CSS v4, Recharts, Framer Motion
- Socket.IO Client, React Hook Form, Zod

**Backend**
- Node.js, Express 4, Socket.IO
- Better-SQLite3, bcryptjs, jsonwebtoken, dotenv

**AI Worker**
- Python 3.10+, PyTorch, Ultralytics YOLOv8
- OpenCV, ByteTrack, yt-dlp, Flask

**Infrastructure**
- Docker, Docker Compose
- Multi-stage builds, volume mounts for persistent media

---

## 📁 Project Structure

```
sar---suspicious-activity-recognition/
├── src/                        # React frontend
│   ├── components/             # AddCameraModal, ROIEditorModal, EventDetailModal
│   ├── pages/                  # Dashboard, Feeds, Events, Analytics, Settings, Login
│   ├── hooks/                  # useWebSocket (Socket.IO integration)
│   ├── lib/                    # auth.ts, utils.ts
│   └── types.ts                # Shared TypeScript interfaces
├── server/                     # Backend modules
│   ├── db.ts                   # SQLite schema + queries
│   └── config.json             # Runtime worker configuration
├── ai_worker/                  # Python inference engine
│   ├── pipeline/
│   │   ├── detector.py         # YOLOv8 + ByteTrack inference loop
│   │   ├── rules.py            # Activity rule engine (ROI, loitering, etc.)
│   │   ├── clip_saver.py       # Video clip + thumbnail writer
│   │   └── mjpeg_server.py     # Flask MJPEG streaming server
│   ├── worker.py               # Dynamic camera thread manager
│   ├── main.py                 # Entry point
│   └── requirements.txt
├── server.ts                   # Express backend entry point
├── build-server.ts             # Production build script
├── docker-compose.yml          # Multi-service orchestration
├── Dockerfile                  # Frontend/backend container
├── .env.example                # Environment variable template
└── vite.config.ts
```

---

## 🚀 Quick Start

### Option 1 — Docker (Recommended, one command)

```bash
# Clone
git clone https://github.com/Sehaan-1/sar---suspicious-activity-recognition.git
cd sar---suspicious-activity-recognition

# Configure environment
cp .env.example .env
# Edit .env: set JWT_SECRET, CLEANUP_MAX_AGE_DAYS, etc.

# Launch all services
docker compose up --build
```

Open **http://localhost:3000** — Default credentials: `admin@sar.ai` / `admin123`

### Option 2 — Hybrid (Local webcam testing)

```bash
# Terminal 1: Backend + Frontend via Docker
docker compose up --build backend-frontend

# Terminal 2: AI Worker natively (for webcam access)
cd ai_worker
pip install -r requirements.txt
python worker.py
```

---

## ⚙️ Environment Variables

Copy `.env.example` → `.env` and configure:

| Variable | Description | Default |
|----------|-------------|---------|
| `JWT_SECRET` | Secret key for JWT signing | — (required) |
| `PORT` | Backend server port | `3001` |
| `CLEANUP_MAX_AGE_DAYS` | Days before media is auto-deleted | `30` |
| `ADMIN_EMAIL` | Initial admin account email | `admin@sar.ai` |
| `ADMIN_PASSWORD` | Initial admin password | `admin123` |

---

## 🎯 Engineering Challenges Solved

- **Dynamic thread orchestration** — Camera threads start/stop/restart without restarting the process; a config-diff algorithm detects changes every 10 seconds and takes minimal action.
- **Cross-platform native bindings** — `better-sqlite3` requires native compilation; solved with multi-stage Docker builds pinned to matching Node.js and OS versions.
- **Frame-accurate state tracking** — ByteTrack assigns stable IDs across frames; loiter timers and ROI intersection are computed per-track-ID, surviving brief occlusions.
- **Storage lifecycle management** — A scheduled cleanup job queries events older than the retention window, deletes associated files from disk, then removes DB records — preventing silent disk exhaustion.
- **Web stream compatibility** — `yt-dlp` resolves the actual HLS/DASH manifest from URLs, letting OpenCV open raw streams from YouTube Live, Twitch, and similar platforms without manual URL extraction.

---

## 📄 License

MIT © [Sehaan-1](https://github.com/Sehaan-1)
