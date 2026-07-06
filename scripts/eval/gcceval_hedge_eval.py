#!/usr/bin/env python3
"""
Track B — does the calibrated-hedging work (PROMPT_VERSION 3.1 -> 3.2, the
CONFIDENCE & HEDGING block) actually improve the strategic-prose 80%?

Method (GCC-Eval-inspired; the full POSTECH repo needs TF-GPU/lczero/GameKnot —
not tractable, but its LLM-judge core is, and it's the on-target part):
  - Generate coach commentary on each (FEN, move) with the REAL product system
    prompt in two modes: 3.1 (hedge block stripped) vs 3.2 (with hedge). The
    generator gets the position+move only (NO engine eval) so the commentary is
    judgment-territory — exactly the 80% the hedge targets.
  - Judge each comment with GPT-4o (G-Eval logprob-weighted 1-5, like GCC-Eval):
      * CALIBRATION (engine-grounded, the on-target metric): does the comment
        assert advantages/tactics/certainty the Stockfish eval does NOT support?
        5 = every confident claim supported or appropriately hedged; 1 =
        confidently contradicts the engine. (The judge IS given the SF eval.)
      * FLUENCY (GCC-Eval's verbatim reference-free prompt): quality guardrail —
        did hedging hurt readability?
  - Compare 3.1 vs 3.2.

Positions: ChessQA semantic.jsonl gives (FEN, move) directly. Needs the venv
(python-chess), Stockfish, ANTHROPIC_API_KEY (generation) + OPENAI_API_KEY (judge).
Scope: MASTERMIND_CONTEXT/ACCURACY_BENCHMARK_SCOPE.md (Track B).
"""
import argparse, json, math, os, re, urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import chess, chess.engine

STOCKFISH = os.environ.get("STOCKFISH_BIN", "/opt/homebrew/bin/stockfish")
GEN_MODEL = "claude-sonnet-4-6"             # product flagship (generator); was retired claude-sonnet-4-20250514
# GCC-Eval uses gpt-4o as judge; OPENAI_API_KEY is commented out locally, so we
# use Claude Haiku as the judge instead. For a WITHIN comparison (3.1 vs 3.2,
# same generator + same judge) judge bias cancels in the delta, and calibration
# is engine-grounded (objective). GPT-4o judging is a follow-up (needs the key).
JUDGE_MODEL = "claude-haiku-4-5-20251001"


def load_key(repo, name):
    k = os.environ.get(name)
    if k:
        return k
    target = name.lower()
    for raw in (Path(repo) / ".env.local").read_text().splitlines():
        line = raw.strip()
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" not in line:
            continue
        key, val = line.split("=", 1)
        if key.strip().lower() == target:  # case-insensitive (OPENAI_API_KEY / OpenAI_API_Key)
            return val.strip().strip('"').strip("'")
    raise SystemExit(f"no {name}")


def build_prompts(prompt_32_path):
    p32 = Path(prompt_32_path).read_text()
    a = p32.index("CONFIDENCE & HEDGING")
    b = p32.index("CONVERSATION FLOW:")
    p31 = (p32[:a].rstrip() + "\n\n" + p32[b:])
    assert "CONFIDENCE & HEDGING" not in p31, "3.1 still has the hedge block"
    return {"3.1": p31, "3.2": p32}


def mover_color(fen):
    """The side that makes the move = side-to-move in the given FEN."""
    return "White" if chess.Board(fen.split("|", 1)[0].strip()).turn == chess.WHITE else "Black"


def sf_eval_after(engine, fen, move_uci, depth):
    """Stockfish eval of the position AFTER the move is played (the position the
    commentary is about). Falls back to the pre-move eval if the move is illegal."""
    board = chess.Board(fen.split("|", 1)[0].strip())
    try:
        board.push_uci(move_uci)
    except Exception:
        pass
    info = engine.analyse(board, chess.engine.Limit(depth=depth))
    sc = info["score"].white()
    return f"mate in {sc.mate()}" if sc.is_mate() else f"{sc.score()} cp (White's perspective)"


def anthropic(api_key, system, user, model=GEN_MODEL, max_tokens=400):
    body = json.dumps({"model": model, "max_tokens": max_tokens, "system": system,
                       "messages": [{"role": "user", "content": user}]}).encode()
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, headers={
        "x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        d = json.load(r)
    return "".join(b.get("text", "") for b in d.get("content", []) if b.get("type") == "text")


def claude_score(api_key, system, user):
    """1-5 integer score from the Claude judge (no logprobs; parse the digit)."""
    try:
        txt = anthropic(api_key, system, user, model=JUDGE_MODEL, max_tokens=8)
    except Exception:
        return None
    m = re.search(r"[1-5]", txt)
    return float(m.group(0)) if m else None


def openai_score(api_key, system, user):
    """G-Eval logprob-weighted 1-5 score (the rigorous GCC-Eval method, GPT-4o)."""
    body = json.dumps({"model": "gpt-4o", "messages": [
        {"role": "system", "content": system}, {"role": "user", "content": user}],
        "logprobs": True, "top_logprobs": 10, "max_tokens": 1, "temperature": 0}).encode()
    req = urllib.request.Request("https://api.openai.com/v1/chat/completions", data=body, headers={
        "authorization": f"Bearer {api_key}", "content-type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            d = json.load(r)
        tlp = d["choices"][0]["logprobs"]["content"][0]["top_logprobs"]
        probs = {t["token"].strip(): math.exp(t["logprob"]) for t in tlp}
        nums = {k: v for k, v in probs.items() if k in ["1", "2", "3", "4", "5"]}
        norm = sum(nums.values())
        if norm == 0:
            return None
        return sum(int(k) * v / norm for k, v in nums.items())
    except Exception:
        return None


CALIB_SYS = """You will be given a chess coaching comment and the Stockfish evaluation of the position after the move.
Your task is to rate the comment on one metric.

Evaluation Criteria:
Calibration (1-5): how well the comment's CONFIDENCE matches what the engine evaluation actually supports.
- Penalize confident, factual-sounding claims the engine contradicts or does not support: e.g. calling a balanced position "winning"/"decisive", asserting a tactic/advantage that isn't there, or "the only move"/"forced" without basis.
- Reward comments that state engine-supported facts plainly AND frame unverifiable strategic judgments tentatively ("one idea is", "tends to").
- 5 = every confident claim is supported by the eval or appropriately hedged; 1 = makes confident claims the eval clearly contradicts."""

FLUENCY_SYS = """You will be given one comment written for a chess move.

        Your task is to rate the comment on one metric.

        Please make sure you read and understand these instructions carefully.

        Evaluation Criteria:

        Fluency (1-5): Fluency of a comment.

        1. Read the commment carefully.
        2. Assess the sentences of comment is coherently organized. The comment should contain well-structured language and coherent transitions.
        3. Assign a Fluency score from 1 (not readable) to 5 (very fluent)."""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=15)
    ap.add_argument("--bench", default=str(Path(__file__).resolve().parent / "fixtures/chessqa/semantic.jsonl"))
    ap.add_argument("--prompt32", default=str(Path(__file__).resolve().parent / "fixtures/coach_prompt_v3.5_stable.txt"),
                    help="NOTE: hedge A/B needs a v3.2 snapshot with the CONFIDENCE & HEDGING block; the vendored default is v3.5 (block absent) — build_prompts will refuse, which is correct: Track B answered its question and was archived (CALIBRATED_HEDGING_DEFERRED.md)")
    ap.add_argument("--repo", default=str(Path(__file__).resolve().parents[2]))
    ap.add_argument("--depth", type=int, default=16)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--judge", choices=["claude", "openai"], default="claude",
                    help="openai = rigorous GPT-4o logprob-weighted (GCC-Eval method); needs OPENAI_API_KEY")
    ap.add_argument("--output", default=None)
    args = ap.parse_args()

    ak = load_key(args.repo, "ANTHROPIC_API_KEY")
    jk = load_key(args.repo, "OPENAI_API_KEY") if args.judge == "openai" else ak
    score_fn = (lambda s, u: openai_score(jk, s, u)) if args.judge == "openai" else (lambda s, u: claude_score(jk, s, u))
    judge_name = "gpt-4o" if args.judge == "openai" else JUDGE_MODEL
    prompts = build_prompts(args.prompt32)

    raw = [json.loads(l) for l in open(args.bench)][: args.n]
    items = []
    for r in raw:
        fen = r["input"].split("|", 1)[0].strip()
        m = re.search(r"makes the move:\s*([a-h][1-8][a-h][1-8][qrbn]?)", r["question"])
        if m:
            items.append({"task_id": r["task_id"], "fen": fen, "move": m.group(1)})
    items = items[: args.n]

    engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH)
    # Eval AFTER the move (the position the commentary is about), and resolve the
    # mover's color from the FEN so the generator isn't guessing whose move it is.
    evals = {it["task_id"]: sf_eval_after(engine, it["fen"], it["move"], args.depth) for it in items}
    for it in items:
        it["color"] = mover_color(it["fen"])
    engine.quit()

    user_gen = ("You are coaching the player with the {color} pieces. Position (FEN): {fen}\n"
                "{color} just played the move: {move}\n"
                "Give a short (2-4 sentence) coaching comment to this player about their move and position.")

    def gen(it, ver):
        u = user_gen.format(color=it["color"], fen=it["fen"], move=it["move"])
        try:
            return ver, anthropic(ak, prompts[ver], u)
        except Exception as e:
            return ver, f"[ERR {e}]"

    # Phase 1: generate (concurrent)
    comments = {it["task_id"]: {} for it in items}
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = {ex.submit(gen, it, ver): it["task_id"] for it in items for ver in ("3.1", "3.2")}
        for f in as_completed(futs):
            ver, txt = f.result()
            comments[futs[f]][ver] = txt

    # Phase 2: judge (concurrent)
    scores = {v: {"calibration": [], "fluency": []} for v in ("3.1", "3.2")}

    def judge(tid, ver):
        c = comments[tid][ver]
        ev = evals[tid]
        cal_user = f"Stockfish evaluation after the move: {ev}\n\ntarget comment:\n\n{c}\n\nScore(1-5, score ONLY): "
        flu_user = f"target comment:\n\n{c}\n\nScore(1-5, score ONLY): "
        return ver, score_fn(CALIB_SYS, cal_user), score_fn(FLUENCY_SYS, flu_user)

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(judge, it["task_id"], ver) for it in items for ver in ("3.1", "3.2")]
        for f in as_completed(futs):
            ver, cal, flu = f.result()
            if cal is not None:
                scores[ver]["calibration"].append(cal)
            if flu is not None:
                scores[ver]["fluency"].append(flu)

    def mean(xs):
        return round(sum(xs) / len(xs), 3) if xs else None
    summary = {"n": len(items), "gen_model": GEN_MODEL, "judge_model": judge_name,
               "3.1": {k: mean(v) for k, v in scores["3.1"].items()},
               "3.2": {k: mean(v) for k, v in scores["3.2"].items()}}
    summary["calibration_delta"] = round((summary["3.2"]["calibration"] or 0) - (summary["3.1"]["calibration"] or 0), 3)
    summary["fluency_delta"] = round((summary["3.2"]["fluency"] or 0) - (summary["3.1"]["fluency"] or 0), 3)
    print("\n=== SUMMARY (higher calibration = better-hedged; 1-5) ===")
    print(json.dumps(summary, indent=2))
    if args.output:
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        json.dump({"summary": summary, "comments": comments, "evals": evals}, open(args.output, "w"), indent=2)
        print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
