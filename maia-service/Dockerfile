FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

# Install CPU-only PyTorch first (avoids downloading ~4GB of CUDA libraries)
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu

# Install remaining Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --no-deps maia2 && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY maia_server.py .

# Pre-download Maia-2 model weights at build time so startup is fast
RUN python -c "from maia2 import model, inference; m = model.from_pretrained(type='rapid', device='cpu'); inference.prepare(); print('Model pre-downloaded successfully')"

# HF Spaces uses port 7860
ENV PORT=7860
EXPOSE 7860

# Run with uvicorn
CMD uvicorn maia_server:app --host 0.0.0.0 --port $PORT
