# Lc0 Evaluation Microservice

FastAPI wrapper around a persistent **Leela Chess Zero** (lc0 v0.31.2, eigen CPU
backend, Maia-1900 network) engine. This is Stage 7 of the Tactical Grounding
Program: the grounding voter (`src/lib/grounding/lc0.ts` + `voter.ts`) uses it as
a second-opinion neural eval next to client Stockfish — confirming or vetoing
`positional_plan` claims and unlocking the `material_win` MED→HIGH upgrade path.

Without this service deployed (`LC0_API_URL` unset), every Lc0 code path quietly
returns null and the voter runs degraded: `positional_plan` can never reach HIGH
confidence.

## API

| Route | Shape |
|---|---|
| `POST /predict` | `{fen, nodes=800}` → `{fen, eval_cp, best_move, nodes, model:"lc0"}` — `eval_cp` is White-positive centipawns (mate clamped at ±10000) |
| `GET /health` | `{status: "ok"\|"degraded", model_loaded, error}` |

The contract must stay in lockstep with `src/lib/grounding/lc0.ts` (`queryLc0`).

## Local development

```bash
cd lc0-service
pip install -r requirements.txt
# You need an lc0 binary + the maia-1900 network. On macOS: brew install lc0
curl -fsSL -o maia-1900.pb.gz https://github.com/CSSLab/maia-chess/releases/download/v1.0/maia-1900.pb.gz
LC0_BINARY=$(which lc0) LC0_NETWORK=./maia-1900.pb.gz uvicorn lc0_server:app --reload --port 8001

# In chess-coach-ai/: LC0_API_URL=http://localhost:8001 npm run dev
```

Note: the Linux CPU release tarball URL referenced in
`MASTERMIND_CONTEXT/TACTICAL_GROUNDING_HANDOFF.md` does not exist (lc0 publishes
no Linux CPU binaries) — the Dockerfile builds from source instead.

## Deploy to Hugging Face Spaces (matches maia-service pattern)

1. huggingface.co → New Space → name e.g. `lc0-chess-service`, SDK: **Docker**,
   hardware: CPU basic (free) — 2 vCPU is enough for 800-node searches.
2. Upload the four files in this directory (`lc0_server.py`, `Dockerfile`,
   `requirements.txt`, this README) to the Space repo. Add HF Spaces frontmatter
   to the Space's README if prompted (`sdk: docker`, `app_port: 7860`).
3. First build compiles lc0 from source — expect ~10–15 minutes. Watch the build
   log; when live, `GET https://<space-url>/health` should return
   `{"status":"ok","model_loaded":true}` (model load takes ~10s after boot).
4. Vercel → chess-coach-ai → Settings → Environment Variables →
   `LC0_API_URL=https://<space-url>` (Production + Preview). No trailing slash,
   no `/predict` suffix — the client appends the route.
5. Redeploy, then verify: `curl https://chessmasti.com/api/lc0-status`.
6. Keep-alive: `/api/keep-lc0-alive` is wired to a daily Vercel cron
   (free-tier Spaces sleep after 48h idle).

## Deploy to Render (alternative)

`render.yaml` in this directory — create a Blueprint service pointing at this
subdirectory. Free tier hibernates; the same keep-alive cron applies.

## Performance & tuning

- 800 nodes on 2 vCPU (eigen backend): typically 1–4s per position. The client
  timeout is 8s and treats failure as "unavailable" — never user-facing.
- `LC0_SEARCH_TIMEOUT_S` (default 7) caps a single search server-side.
- The voter calls this service only at contested positions (|SF| ≤ 200cp with
  two candidate moves within 30cp) — typically 1–3 calls per 40-move game.

## License note

lc0 is GPL-3. It runs server-side as a separate process/service and is not
distributed with the product, so it imposes nothing on the app's license.
