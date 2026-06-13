#!/usr/bin/env python3
"""
ChessQA grounding eval — does our Stockfish grounding improve the model's chess
accuracy? Runs ChessQA benchmark items through the product's flagship model in
two modes:
  - OFF: bare prompt (raw model chess ability)
  - ON:  Stockfish engine analysis injected into ChessQA's CONTEXT_PLACEHOLDER
         (mirrors the product's core grounding mechanism: eval + top PV lines)

Answer extraction + scoring are copied VERBATIM from ChessQA's
eval/run_openrouter.py so the numbers match their methodology.

Run (needs the venv with python-chess + a Stockfish binary):
  /tmp/chessqa-venv/bin/python scripts/eval/chessqa_grounding_eval.py \
      --category short_tactics --n 15 --output scripts/eval/results/chessqa-short_tactics.json

  add --dry-run to build prompts + engine context with ZERO API calls.

Scope: MASTERMIND_CONTEXT/ACCURACY_BENCHMARK_SCOPE.md (Track A).
"""
import argparse, json, os, re, urllib.request
from pathlib import Path
import chess, chess.engine

STOCKFISH = os.environ.get("STOCKFISH_BIN", "/opt/homebrew/bin/stockfish")
MODEL = "claude-sonnet-4-20250514"  # product flagship — src/lib/llmProvider.ts
ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"


def load_api_key(repo: str) -> str:
    k = os.environ.get("ANTHROPIC_API_KEY")
    if k:
        return k
    envp = Path(repo) / ".env.local"
    for line in envp.read_text().splitlines():
        if line.startswith("ANTHROPIC_API_KEY="):
            return line.split("=", 1)[1].strip().strip('"').strip("'")
    raise SystemExit("no ANTHROPIC_API_KEY in env or .env.local")


# ── ChessQA scorers — copied verbatim from eval/run_openrouter.py ───────────────
def extract_answer(response: str):
    matches = list(re.finditer(r"FINAL ANSWER:\s*(.+?)(?:\n|$)", response, re.IGNORECASE | re.DOTALL))
    if matches:
        a = matches[-1].group(1).strip()
        a = re.sub(r"^FINAL ANSWER:\s*", "", a, flags=re.IGNORECASE).strip()
        a = re.sub(r"^\*+|\*+$", "", a).strip()
        return a.strip(), True
    return "", False


def is_correct(extracted: str, correct: str, answer_type: str) -> bool:
    if answer_type == "multi":
        e = set(x.strip().lower() for x in extracted.split(",") if x.strip())
        c = set(x.strip().lower() for x in correct.split(",") if x.strip())
        return e == c
    return extracted.lower().strip() == correct.lower().strip()


def format_prompt(task: dict, context: str) -> str:
    q = task["question"].replace("CONTEXT_PLACEHOLDER", context)
    if task.get("format_examples"):
        q = q.replace("FORMAT_EXAMPLE_PLACEHOLDER", task["format_examples"][0])
    return q


# ── Our-style grounding: Stockfish eval + top PV lines (the "ON" context) ──────
def stockfish_context(engine, fen: str, depth: int, multipv: int = 3) -> str:
    fen_clean = fen.split("|", 1)[0].strip()
    board = chess.Board(fen_clean)
    info = engine.analyse(board, chess.engine.Limit(depth=depth), multipv=multipv)
    if isinstance(info, dict):
        info = [info]
    lines = []
    for i, pv in enumerate(info):
        sc = pv["score"].white()
        label = f"mate in {sc.mate()}" if sc.is_mate() else f"{sc.score()} cp"
        try:
            moves = board.variation_san(pv["pv"][:6]) if pv.get("pv") else ""
        except Exception:
            moves = " ".join(m.uci() for m in pv.get("pv", [])[:6])
        lines.append(f"  Line {i + 1}: eval {label} (White's perspective) | {moves}")
    return "Engine analysis (Stockfish, ground truth):\n" + "\n".join(lines) + "\n\n"


def call_claude(api_key: str, prompt: str, max_tokens: int = 2048):
    body = json.dumps({
        "model": MODEL,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }).encode()
    req = urllib.request.Request(ANTHROPIC_URL, data=body, headers={
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    })
    with urllib.request.urlopen(req, timeout=180) as r:
        data = json.load(r)
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    usage = data.get("usage", {})
    return text, usage


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--category", default="short_tactics")
    ap.add_argument("--n", type=int, default=15)
    ap.add_argument("--bench", default="/tmp/chessqa-benchmark/benchmark")
    ap.add_argument("--repo", default=str(Path.home() / "Downloads/Inspirit_project/chess-coach-ai"))
    ap.add_argument("--depth", type=int, default=18)
    ap.add_argument("--output", default=None)
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    api_key = None if args.dry_run else load_api_key(args.repo)
    items = [json.loads(l) for l in open(Path(args.bench) / f"{args.category}.jsonl")][: args.n]
    engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH)

    results = []
    tally = {"off": {"correct": 0, "total": 0}, "on": {"correct": 0, "total": 0}}
    for idx, task in enumerate(items):
        ctx = stockfish_context(engine, task["input"], depth=args.depth)
        row = {"task_id": task["task_id"], "correct_answer": task["correct_answer"]}
        for mode, context in [("off", ""), ("on", ctx)]:
            prompt = format_prompt(task, context)
            if args.dry_run:
                row[mode] = {"prompt_chars": len(prompt)}
                continue
            try:
                resp, _ = call_claude(api_key, prompt)
            except Exception as e:
                resp = f"[ERROR {e}]"
            ext, ok = extract_answer(resp)
            corr = ok and is_correct(ext, task["correct_answer"], task.get("answer_type", "single"))
            tally[mode]["total"] += 1
            tally[mode]["correct"] += 1 if corr else 0
            row[mode] = {"extracted": ext, "correct": corr}
        results.append(row)
        if args.dry_run:
            print(f"[{idx+1}/{len(items)}] {task['task_id']} ctx_chars={len(ctx)} (dry)")
        else:
            print(f"[{idx+1}/{len(items)}] {task['task_id']}: off={'Y' if row['off']['correct'] else 'n'} "
                  f"on={'Y' if row['on']['correct'] else 'n'} | ans={task['correct_answer']} "
                  f"off='{row['off']['extracted'][:12]}' on='{row['on']['extracted'][:12]}'")
    engine.quit()

    if args.dry_run:
        print("\nDRY RUN ok — prompts + engine context built, no API calls.")
        # show one ON prompt for eyeballing
        print("\n----- sample ON prompt (item 1) -----")
        print(format_prompt(items[0], stockfish_context(chess.engine.SimpleEngine.popen_uci(STOCKFISH), items[0]["input"], args.depth))[:1200])
        return

    def pct(m):
        return 100 * tally[m]["correct"] / max(1, tally[m]["total"])
    summary = {
        "category": args.category, "n": len(items), "model": MODEL, "engine_depth": args.depth,
        "off_accuracy_pct": round(pct("off"), 1),
        "on_accuracy_pct": round(pct("on"), 1),
        "delta_pp": round(pct("on") - pct("off"), 1),
        "tally": tally,
    }
    print("\n=== SUMMARY ===")
    print(json.dumps(summary, indent=2))
    if args.output:
        Path(args.output).parent.mkdir(parents=True, exist_ok=True)
        json.dump({"summary": summary, "results": results}, open(args.output, "w"), indent=2)
        print(f"\nwrote {args.output}")


if __name__ == "__main__":
    main()
