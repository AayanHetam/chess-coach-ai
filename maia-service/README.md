# Maia-2 Chess Prediction Microservice

A lightweight FastAPI server that runs **Maia-2** (NeurIPS 2024) for human-like chess move predictions. Designed to be deployed separately from the Vercel frontend.

## Why a separate service?

Vercel serverless functions cannot run native binaries like LC0. Maia-2 is a pure PyTorch model that needs a persistent Python process, which serverless doesn't support. This microservice solves that.

## Local Development

```bash
cd maia-service
pip install -r requirements.txt
uvicorn maia_server:app --reload --port 8000
```

Then set `MAIA_API_URL=http://localhost:8000` in your `.env.local`.

## Deploy to Railway (Recommended)

1. Install Railway CLI: `npm i -g @railway/cli`
2. Login: `railway login`
3. Create project: `railway init`
4. Deploy: `railway up`
5. Get the URL from Railway dashboard
6. Set `MAIA_API_URL=https://your-service.railway.app` in Vercel environment variables

## Deploy to Render

1. Push this folder to a GitHub repo (or subfolder)
2. Create a new **Web Service** on [render.com](https://render.com)
3. Point to this directory, set build command to `pip install -r requirements.txt`
4. Set start command to `uvicorn maia_server:app --host 0.0.0.0 --port $PORT`
5. Set `MAIA_API_URL` in Vercel

## Deploy with Docker

```bash
docker build -t maia-service .
docker run -p 8000:8000 maia-service
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `USE_GPU` | `false` | Set to `true` or `1` for GPU inference |
| `MAIA2_GAME_TYPE` | `rapid` | Model variant: `rapid` or `blitz` |
| `ALLOWED_ORIGINS` | `*` | Comma-separated list of allowed CORS origins |

## API Endpoints

### `POST /predict`
```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1",
  "rating": 1500,
  "opponent_rating": 1500
}
```

Response:
```json
{
  "humanLikeMove": "e5",
  "confidence": 0.35,
  "alternativeMoves": [
    { "move": "c5", "probability": 0.22 },
    { "move": "e6", "probability": 0.12 }
  ],
  "rating": 1500,
  "model": "maia2"
}
```

### `GET /health`
Returns service status and model load state.
