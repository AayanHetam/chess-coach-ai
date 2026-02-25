"""
Maia-2 Chess Prediction Microservice

A lightweight FastAPI server that runs Maia-2 (NeurIPS 2024) for human-like
chess move predictions. Designed to be deployed on Railway/Fly.io/Render and
called from the Vercel-hosted Chess Masti AI frontend.

Maia-2 is a unified model that predicts what humans at a given ELO would play.
It does NOT require LC0 — it's pure PyTorch inference.
"""

import os
import logging
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import chess

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("maia-service")

app = FastAPI(
    title="Maia-2 Chess Prediction API",
    description="Human-like chess move predictions powered by Maia-2",
    version="1.0.0",
)

# CORS — allow the Vercel frontend to call this service
ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,https://*.vercel.app"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to your Vercel domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Global model state (loaded once at startup)
# ---------------------------------------------------------------------------
maia2_model = None
prepared = None
model_loaded = False
load_error: Optional[str] = None


@app.on_event("startup")
async def load_model():
    """Load Maia-2 model at startup so it's ready for requests."""
    global maia2_model, prepared, model_loaded, load_error
    try:
        from maia2 import model as maia2_model_module, inference

        device = "gpu" if os.environ.get("USE_GPU", "").lower() in ("1", "true") else "cpu"
        game_type = os.environ.get("MAIA2_GAME_TYPE", "rapid")  # "rapid" or "blitz"

        logger.info(f"Loading Maia-2 model (type={game_type}, device={device})...")
        maia2_model = maia2_model_module.from_pretrained(type=game_type, device=device)
        prepared = inference.prepare()
        model_loaded = True
        logger.info("✅ Maia-2 model loaded successfully")
    except Exception as e:
        load_error = str(e)
        logger.error(f"❌ Failed to load Maia-2 model: {e}")


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------
class PredictRequest(BaseModel):
    fen: str = Field(..., description="FEN string of the chess position")
    rating: int = Field(1500, description="Active player's ELO rating", ge=100, le=3500)
    opponent_rating: int = Field(1500, description="Opponent's ELO rating", ge=100, le=3500)


class MoveProb(BaseModel):
    move: str
    probability: float


class PredictResponse(BaseModel):
    humanLikeMove: str
    confidence: float
    alternativeMoves: list[MoveProb]
    rating: int
    model: str = "maia2"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/health")
def health():
    """Health check endpoint."""
    return {
        "status": "ok" if model_loaded else "degraded",
        "model": "maia2",
        "model_loaded": model_loaded,
        "error": load_error,
    }


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    """
    Predict the most human-like move for a given position and rating.

    Returns the top move with confidence, plus up to 4 alternative moves
    with their probabilities.
    """
    if not model_loaded or maia2_model is None or prepared is None:
        raise HTTPException(
            status_code=503,
            detail=f"Maia-2 model not loaded. Error: {load_error or 'Unknown'}",
        )

    # Validate FEN
    try:
        board = chess.Board(req.fen)
        if not board.is_valid():
            raise ValueError("Invalid board state")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid FEN: {e}")

    # Check for legal moves
    legal_moves = list(board.legal_moves)
    if not legal_moves:
        raise HTTPException(status_code=400, detail="No legal moves in this position")

    try:
        from maia2 import inference

        move_probs, win_prob = inference.inference_each(
            maia2_model, prepared,
            req.fen, req.rating, req.opponent_rating,
        )

        if not move_probs:
            raise HTTPException(status_code=500, detail="Maia-2 returned no predictions")

        # Sort moves by probability (descending)
        sorted_moves = sorted(move_probs.items(), key=lambda x: -x[1])

        best_move_uci = sorted_moves[0][0]
        best_confidence = sorted_moves[0][1]

        # Convert UCI move to SAN for the response
        best_move_san = best_move_uci
        try:
            move_obj = board.parse_uci(best_move_uci)
            best_move_san = board.san(move_obj)
        except Exception:
            pass  # Keep UCI if conversion fails

        # Build alternative moves (next 4)
        alternatives = []
        for uci_move, prob in sorted_moves[1:5]:
            san = uci_move
            try:
                move_obj = board.parse_uci(uci_move)
                san = board.san(move_obj)
            except Exception:
                pass
            alternatives.append(MoveProb(move=san, probability=round(prob, 4)))

        return PredictResponse(
            humanLikeMove=best_move_san,
            confidence=round(max(0.1, min(1.0, best_confidence)), 4),
            alternativeMoves=alternatives,
            rating=req.rating,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Prediction error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Prediction failed: {e}")


@app.get("/")
def root():
    """API documentation landing."""
    return {
        "name": "Maia-2 Chess Prediction API",
        "description": "Human-like chess move predictions powered by Maia-2 (NeurIPS 2024)",
        "endpoints": {
            "POST /predict": {
                "description": "Predict human-like move for a position",
                "body": {
                    "fen": "string (required) - FEN position",
                    "rating": "int (optional, default 1500) - Player ELO",
                    "opponent_rating": "int (optional, default 1500) - Opponent ELO",
                },
            },
            "GET /health": "Service health check",
        },
        "model_status": "loaded" if model_loaded else f"error: {load_error}",
    }
