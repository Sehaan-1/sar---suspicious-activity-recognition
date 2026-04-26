# 🔍 SAR — Suspicious Activity Recognition System

Real-time AI surveillance system detecting fighting, loitering, trespassing, and unattended baggage from live video feeds.

## ✨ Features
- 🎥 **Multi-Camera Processing**: Concurrent multi-threaded video stream analysis.
- 🧠 **Advanced AI Vision**: Built on YOLOv8 + ByteTrack for highly accurate object detection and tracking.
- ⚡ **Real-Time WebSockets**: Sub-second alert pushes to the modern React dashboard.
- 🔄 **Dynamic Camera Sync**: Add, remove, or modify cameras in the dashboard and the AI worker dynamically spawns, stops, or restarts inference threads on the fly—no system reboot required!
- 🌐 **Web Stream Extraction**: Integrated `yt-dlp` automatically extracts raw video feeds from YouTube Live links and other streaming websites, bypassing complex web players.
- 🧹 **Automated Storage Management**: Background routines automatically prune video clips, thumbnails, and database records older than 30 days to prevent unconstrained storage growth.
- 🐳 **Production-Ready Docker**: Fully containerized backend, frontend, and AI worker for a flawless one-command deployment.

## 🏗️ Architecture
The system follows a highly scalable microservices architecture:
- **Node.js/Express Backend**: Handles REST API requests, SQLite database management, automated storage cleanup, and WebSocket event broadcasting.
- **React/Vite Frontend**: A beautiful, responsive dashboard for managing cameras, viewing live MJPEG streams, and reviewing historical suspicious events.
- **Python AI Worker**: A decoupled, thread-safe inference engine that continuously polls the backend for camera configurations, fetches frames via OpenCV, runs YOLOv8 inference, applies rule-based logic (e.g. ROI intersections), and POSTs security alerts back to the main server.

## 🛠️ Tech Stack
**Frontend:** React 19, TypeScript, Tailwind CSS, Recharts, Socket.IO Client, Vite  
**Backend:** Node.js, Express, Socket.IO, Better-SQLite3  
**AI Worker:** Python, PyTorch, YOLOv8, OpenCV, yt-dlp, Flask (MJPEG Streaming)  
**Deployment:** Docker, Docker Compose

## 🚀 Quick Start
The entire system (Backend, Frontend, and AI Worker) is fully Dockerized.

### 1. Run via Docker (Recommended)
```bash
docker compose up --build
```
The application will be available at `http://localhost:3000`.
*Default Credentials: `admin@sar.ai` / `admin123`*

### 2. Hybrid Run (For local Webcam testing)
If you want to test the AI with your local laptop webcam (Source `0`), you can run the backend in Docker and the AI worker natively on your host machine:
```bash
# Terminal 1: Run the backend and dashboard
docker compose up --build backend-frontend

# Terminal 2: Run the AI worker natively
cd ai_worker
pip install -r requirements.txt
python worker.py
```

## 🎯 What I Learned
- Building real-time ML inference pipelines and decoupling them from web infrastructure.
- Handling cross-platform native bindings (`better-sqlite3`) inside Linux Docker containers.
- Multi-object tracking, frame skipping optimizations, and cross-frame state management.
- Designing event-driven architectures with WebSockets for sub-second UI updates.
- Writing robust thread-management systems to dynamically sync hardware state with database configurations.
