FROM python:3.11-slim

WORKDIR /app

# System libs required by OpenCV
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the CPU-friendly default model so the container starts quickly
RUN python -c "from ultralytics import YOLO; YOLO('yolov8n.pt')"

COPY . .

CMD ["python", "worker.py"]
