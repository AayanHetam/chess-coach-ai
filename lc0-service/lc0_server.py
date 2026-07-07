"""
Lc0 Chess Evaluation Microservice — Stage 7 of the Tactical Grounding Program.

Wraps a single persistent Leela Chess Zero (lc0) UCI engine behind a FastAPI
HTTP API. Consumed by chess-coach-ai's grounding voter (src/lib/grounding/lc0.ts)
as a second-opinion neural evaluation alongside client Stockfish.

API contract (must match src/lib/grounding/lc0.ts exactly):
  POST /predict  {fen: str, nodes: int=800}
             ->  {fen, eval_cp: int|None, best_move: str|None, nodes, model}
                 eval_cp is WHITE-POSITIVE centipawns (same POV as Stockfish
                 evals throughout chess-coach-ai). Mate scores are clamped via
                 mate_score=10000 so agreement math still works.
  GET  /health   -> {status, model_loaded, error}

Engine access is serialized with a lock: lc0 runs one search at a time and
the voter's client timeout is 8s, so queued requests either run quickly or
the client gives up harmlessly (it treats null as "Lc0 unavailable").
"""

import logging
import os
import threading
from typing import Optional

import chess
import chess.engine
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("lc0-service")

LC0_BINARY = os.environ.get("LC0_BINARY", "/app/bin/lc0")
LC0_NETWORK = os.environ.get("LC0_NETWORK", "/app/nets/maia-1900.pb.gz")
# Wall-clock ceiling per search. The voter's client timeout is 8s; giving up
# server-side slightly earlier returns a clean null instead of a client abort.
SEARCH_TIMEOUT_S = float(os.environ.get("LC0_SEARCH_TIMEOUT_S", "7"))

app = FastAPI(
    title="Lc0 Chess Evaluation API",
    description="Second-opinion neural evaluation via Leela Chess Zero",
    version="1.0.0",
)

engine: Optional[chess.engine.SimpleEngine] = None
engine_lock = threading.Lock()
engine_loaded = False
load_error: Optional[str] = None


def _load_engine() -> None:
    global engine, engine_loaded, load_error
    try:
        logger.info("Starting lc0: binary=%s network=%s", LC0_BINARY, LC0_NETWORK)
        engine = chess.engine.SimpleEngine.popen_uci(
            [LC0_BINARY, f"--weights={LC0_NETWORK}", "--backend=eigen"]
        )
        engine_loaded = True
        logger.info("lc0 ready: %s", engine.id.get("name", "unknown"))
    except Exception as exc:  # noqa: BLE001 — surface anything via /health
        load_error = str(exc)
        logger.error("Failed to start lc0: %s", exc)


@app.on_event("startup")
def startup() -> None:
    # Load in a background thread so /health responds immediately while the
    # engine (and its network file) initializes on cold start.
    threading.Thread(target=_load_engine, daemon=True).start()


@app.on_event("shutdown")
def shutdown() -> None:
    if engine is not None:
        try:
            engine.quit()
        except Exception:  # noqa: BLE001
            pass


class PredictRequest(BaseModel):
    fen: str = Field(..., description="FEN of the position to evaluate")
    nodes: int = Field(800, ge=1, le=10000, description="Search node budget")


class PredictResponse(BaseModel):
    fen: str
    eval_cp: Optional[int]
    best_move: Optional[str]
    nodes: int
    model: str = "lc0"


@app.get("/")
def root() -> dict:
    return {"service": "lc0", "endpoints": ["/health", "/predict"]}


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok" if engine_loaded else "degraded",
        "model_loaded": engine_loaded,
        "error": load_error,
    }


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest) -> PredictResponse:
    if not engine_loaded or engine is None:
        raise HTTPException(
            status_code=503,
            detail=f"lc0 not loaded: {load_error or 'still starting'}",
        )

    try:
        board = chess.Board(req.fen)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid FEN: {exc}") from exc
    if not board.is_valid():
        raise HTTPException(status_code=400, detail="Illegal position")

    eval_cp: Optional[int] = None
    best_move: Optional[str] = None
    try:
        with engine_lock:
            info = engine.analyse(
                board,
                chess.engine.Limit(nodes=req.nodes, time=SEARCH_TIMEOUT_S),
            )
        score = info.get("score")
        if score is not None:
            eval_cp = score.white().score(mate_score=10000)
        pv = info.get("pv")
        if pv:
            best_move = pv[0].uci()
    except chess.engine.EngineError as exc:
        raise HTTPException(status_code=500, detail=f"Engine error: {exc}") from exc

    return PredictResponse(
        fen=req.fen,
        eval_cp=eval_cp,
        best_move=best_move,
        nodes=req.nodes,
        model="lc0",
    )
