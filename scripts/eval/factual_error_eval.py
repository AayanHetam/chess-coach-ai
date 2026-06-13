#!/usr/bin/env python3
"""
Position-fact-grounding investigation (POSITION_FACT_GROUNDING_PLAN.md, step 1).

The accuracy benchmarks showed the coach's miscalibration is confident FACTUAL
position errors (wrong player moved, wrong move analyzed, invented tactics), not
hedge-able tone. This locates the leak: a 2x2 of
   {Sonnet flagship, Haiku follow-up} x {ungrounded, grounded}
on (FEN, move) positions, scored by a factual-accuracy judge that is given the
GROUND TRUTH (FEN + move + whose-move + eval + piece map). Lower = more errors.

Hypotheses: (1) grounding reduces factual errors (grounded > ungrounded);
(2) Haiku is materially worse than Sonnet (the follow-up path is the suspect).

The "grounded" context is a Stockfish-derived position-fact block (eval + best
line + piece map) — a proxy for the product's grounding good enough to test the
direction. Needs venv (python-chess), Stockfish, ANTHROPIC_API_KEY.
"""
import argparse, json, os, re, urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import chess, chess.engine

STOCKFISH = os.environ.get("STOCKFISH_BIN", "/opt/homebrew/bin/stockfish")
SONNET = "claude-sonnet-4-20250514"        # flagship
HAIKU = "claude-haiku-4-5-20251001"         # fast follow-up tier
JUDGE = "claude-sonnet-4-20250514"          # judge (capable; given ground truth)
NAMES = {"sonnet": SONNET, "haiku": HAIKU}


def load_key(repo, name="ANTHROPIC_API_KEY"):
    k = os.environ.get(name)
    if k:
        return k
    for raw in (Path(repo) / ".env.local").read_text().splitlines():
        line = raw.strip()
        if line.startswith("export "):
            line = line[7:].strip()
        if "=" in line and line.split("=", 1)[0].strip().lower() == name.lower():
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit(f"no {name}")


def anthropic(api_key, model, system, user, max_tokens=400):
    body = json.dumps({"model": model, "max_tokens": max_tokens, "system": system,
                       "messages": [{"role": "user", "content": user}]}).encode()
    req = urllib.request.Request("https://api.anthropic.com/v1/messages", data=body, headers={
        "x-api-key": api_key, "anthropic-version": "2023-06-01", "content-type": "application/json"})
    with urllib.request.urlopen(req, timeout=180) as r:
        d = json.load(r)
    return "".join(b.get("text", "") for b in d.get("content", []) if b.get("type") == "text")


def piece_map(board):
    names = {1: "P", 2: "N", 3: "B", 4: "R", 5: "Q", 6: "K"}
    w, b = [], []
    for sq in chess.SQUARES:
        p = board.piece_at(sq)
        if p:
            (w if p.color == chess.WHITE else b).append(names[p.piece_type] + chess.square_name(sq))
    return f"White: {' '.join(w)}\nBlack: {' '.join(b)}"


def ground_truth(engine, fen, move_uci, depth):
    board = chess.Board(fen.split("|", 1)[0].strip())
    color = "White" if board.turn == chess.WHITE else "Black"
    san = move_uci
    try:
        san = board.san(chess.Move.from_uci(move_uci))
    except Exception:
        pass
    after = board.copy()
    try:
        after.push_uci(move_uci)
    except Exception:
        pass
    info = engine.analyse(after, chess.engine.Limit(depth=depth), multipv=2)
    if isinstance(info, dict):
        info = [info]
    lines = []
    for pv in info:
        sc = pv["score"].white()
        lab = f"mate in {sc.mate()}" if sc.is_mate() else f"{sc.score()} cp"
        try:
            pvsan = after.variation_san(pv["pv"][:5]) if pv.get("pv") else ""
        except Exception:
            pvsan = ""
        lines.append(f"  eval {lab} (White's perspective) | {pvsan}")
    return {"color": color, "san": san, "eval_lines": "\n".join(lines),
            "pieces_after": piece_map(after)}


def grounding_block(gt):
    return ("Engine + position facts (ground truth):\n"
            f"- {gt['color']} just played {gt['san']}.\n"
            f"- Resulting position pieces:\n{gt['pieces_after']}\n"
            f"- Stockfish analysis of the resulting position:\n{gt['eval_lines']}\n\n")


JUDGE_SYS = """You are checking a chess coaching comment for FACTUAL errors about the position.
You are given the GROUND TRUTH (whose move it was, the move played, the eval, and the exact piece placement AFTER the move).

Rate FACTUAL ACCURACY (1-5):
- Does the comment correctly state whose move it was and what move was played?
- Does it correctly describe which pieces are where and what the move actually does (attacks/defends/threats)?
- Penalize: wrong player credited with the move, analyzing a DIFFERENT move than was played, naming pieces/squares that don't match, inventing tactics/threats that don't exist.
5 = no factual errors; 3 = one notable factual error; 1 = multiple clear factual errors.
Output the score ONLY (a single digit 1-5)."""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=15)
    ap.add_argument("--bench", default="/tmp/chessqa-benchmark/benchmark/semantic.jsonl")
    ap.add_argument("--prompt", default="/tmp/coach_prompt_32.txt",
                    help="coach system prompt file (hedge block stripped automatically)")
    ap.add_argument("--repo", default=str(Path.home() / "Downloads/Inspirit_project/chess-coach-ai"))
    ap.add_argument("--depth", type=int, default=16)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--output", default=None)
    args = ap.parse_args()

    ak = load_key(args.repo)
    sysprompt = Path(args.prompt).read_text()
    if "CONFIDENCE & HEDGING" in sysprompt:  # use the reverted (3.3) base
        a = sysprompt.index("CONFIDENCE & HEDGING")
        b = sysprompt.index("CONVERSATION FLOW:")
        sysprompt = sysprompt[:a].rstrip() + "\n\n" + sysprompt[b:]

    raw = [json.loads(l) for l in open(args.bench)]
    items = []
    for r in raw:
        m = re.search(r"makes the move:\s*([a-h][1-8][a-h][1-8][qrbn]?)", r["question"])
        if m:
            items.append({"task_id": r["task_id"], "fen": r["input"].split("|", 1)[0].strip(), "move": m.group(1)})
        if len(items) >= args.n:
            break

    engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH)
    gt = {it["task_id"]: ground_truth(engine, it["fen"], it["move"], args.depth) for it in items}
    engine.quit()

    conds = ["sonnet_ungrounded", "sonnet_grounded", "haiku_ungrounded", "haiku_grounded"]

    def user_msg(it, grounded):
        g = grounding_block(gt[it["task_id"]]) if grounded else ""
        return (f"You are coaching the player with the {gt[it['task_id']]['color']} pieces. "
                f"Position (FEN): {it['fen']}\n{gt[it['task_id']]['color']} just played: {it['move']}\n{g}"
                "Give a short (2-4 sentence) coaching comment to this player about their move and position.")

    comments = {it["task_id"]: {} for it in items}

    def gen(it, cond):
        model = NAMES["sonnet" if cond.startswith("sonnet") else "haiku"]
        grounded = cond.endswith("grounded") and "ungrounded" not in cond
        try:
            return it["task_id"], cond, anthropic(ak, model, sysprompt, user_msg(it, grounded))
        except Exception as e:
            return it["task_id"], cond, f"[ERR {e}]"

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(gen, it, c) for it in items for c in conds]
        for f in as_completed(futs):
            tid, cond, txt = f.result()
            comments[tid][cond] = txt

    scores = {c: [] for c in conds}

    def judge(tid, cond):
        g = gt[tid]
        truth = (f"Whose move: {g['color']}\nMove played: {g['san']}\n"
                 f"Eval + lines (after move):\n{g['eval_lines']}\nPieces after move:\n{g['pieces_after']}")
        u = f"GROUND TRUTH:\n{truth}\n\nCOACH COMMENT TO CHECK:\n{comments[tid][cond]}\n\nFactual accuracy score (1-5, digit ONLY): "
        try:
            txt = anthropic(ak, JUDGE, JUDGE_SYS, u, max_tokens=8)
            m = re.search(r"[1-5]", txt)
            return cond, float(m.group(0)) if m else None
        except Exception:
            return cond, None

    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(judge, it["task_id"], c) for it in items for c in conds]
        for f in as_completed(futs):
            cond, s = f.result()
            if s is not None:
                scores[cond].append(s)

    def mean(xs):
        return round(sum(xs) / len(xs), 3) if xs else None
    summary = {"n": len(items), "judge": JUDGE, "factual_accuracy_1to5": {c: mean(scores[c]) for c in conds}}
    fa = summary["factual_accuracy_1to5"]
    summary["grounding_lift_sonnet"] = round((fa["sonnet_grounded"] or 0) - (fa["sonnet_ungrounded"] or 0), 3)
    summary["grounding_lift_haiku"] = round((fa["haiku_grounded"] or 0) - (fa["haiku_ungrounded"] or 0), 3)
    summary["sonnet_vs_haiku_ungrounded"] = round((fa["sonnet_ungrounded"] or 0) - (fa["haiku_ungrounded"] or 0), 3)
    print("\n=== SUMMARY (factual accuracy 1-5, higher = fewer position errors) ===")
    print(json.dumps(summary, indent=2))
    if args.output:
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        json.dump({"summary": summary, "comments": comments, "ground_truth": gt}, open(args.output, "w"), indent=2)
        print(f"wrote {args.output}")


if __name__ == "__main__":
    main()
