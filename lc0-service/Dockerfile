# Lc0 microservice — builds lc0 v0.31.2 from source (the project publishes no
# Linux CPU release binaries; the URL pinned in TACTICAL_GROUNDING_HANDOFF.md
# 404s) and serves it behind FastAPI. Eigen backend: pure-CPU, no BLAS/GPU.

# ── Stage 1: compile lc0 ────────────────────────────────────────────────────
FROM debian:bookworm-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends \
    git g++ meson ninja-build pkg-config libeigen3-dev zlib1g-dev ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch v0.31.2 --recurse-submodules \
    https://github.com/LeelaChessZero/lc0.git /lc0

WORKDIR /lc0
RUN meson setup build --buildtype=release -Deigen=true -Dblas=false -Dgtest=false \
    && ninja -C build lc0

# ── Stage 2: runtime ────────────────────────────────────────────────────────
FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    zlib1g \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /lc0/build/lc0 /app/bin/lc0

# Maia-1900 network weights (human-calibrated ~1900-strength policy; the
# handoff-specified network for second-opinion evals). URL verified live.
ADD https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1900.pb.gz /app/nets/maia-1900.pb.gz
RUN chmod a+r /app/nets/maia-1900.pb.gz

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY lc0_server.py .

ENV PORT=7860 \
    LC0_BINARY=/app/bin/lc0 \
    LC0_NETWORK=/app/nets/maia-1900.pb.gz

# HF Spaces expects the app on 7860
EXPOSE 7860

CMD uvicorn lc0_server:app --host 0.0.0.0 --port $PORT
