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

Run (pip install -r scripts/eval/requirements.txt + a Stockfish binary):
  python3 scripts/eval/chessqa_grounding_eval.py \
      --category short_tactics --n 15 --output scripts/eval/results/chessqa-short_tactics.json

  add --dry-run to build prompts + engine context with ZERO API calls.

Scope: MASTERMIND_CONTEXT/ACCURACY_BENCHMARK_SCOPE.md (Track A).
"""
import argparse, json, os, re, urllib.request
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
import chess, chess.engine

STOCKFISH = os.environ.get("STOCKFISH_BIN", "/opt/homebrew/bin/stockfish")
MODEL = "claude-sonnet-4-6"  # product flagship — src/lib/llmProvider.ts (was retired claude-sonnet-4-20250514)
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


def call_claude(api_key: str, prompt: str, max_tokens: int = 2048, system: str | None = None,
                model: str = MODEL, effort: str | None = None, thinking: str | None = None):
    payload = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    # Fable/Opus-5 tier: thinking is always on; `output_config.effort` is the
    # only depth control (budget_tokens is rejected). Older models ignore it.
    if effort:
        payload["output_config"] = {"effort": effort}
    # Sonnet 5 / Opus 5 think ADAPTIVELY by default and the thinking is billed
    # as output inside max_tokens: the first Sonnet 5 run here spent ~2.8k
    # tokens per item thinking and 21/25 answers were cut off before FINAL
    # ANSWER (scored 16%). "disabled" reproduces the no-thinking conditions
    # the Sonnet 4.6 baseline ran under; "adaptive" is the model's default.
    if thinking:
        payload["thinking"] = {"type": thinking}
    # PR-CI-4: optional system prompt so the verbalizer-4.0 charter can be
    # measured against the grounded baseline (plan §7 CI-4 ChessQA gate).
    if system:
        payload["system"] = system
    body = json.dumps(payload).encode()
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
    ap.add_argument("--bench", default=str(Path(__file__).resolve().parent / "fixtures/chessqa"),
                    help="ChessQA jsonl dir (vendored 100-item subsets in-repo; point at a full clone for bigger n)")
    ap.add_argument("--repo", default=str(Path(__file__).resolve().parents[2]))
    ap.add_argument("--depth", type=int, default=18)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--output", default=None)
    ap.add_argument("--system-file", default=None,
                    help="optional file whose contents ride as the system prompt on every call "
                         "(PR-CI-4: the verbalizer-4.0 system, to gate the charter against the grounded baseline)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--model", default=MODEL, help="Anthropic model id (default: the product flagship)")
    ap.add_argument("--effort", default=None, help="output_config.effort for effort-capable models (low|medium|high|xhigh|max)")
    ap.add_argument("--modes", default="both", choices=["both", "off", "on"],
                    help="off = no engine context only (1 call/item), on = engine context only, both = the A/B")
    ap.add_argument("--max-tokens", type=int, default=2048)
    ap.add_argument("--offset", type=int, default=0, help="skip the first N items (resume / extend a partial run)")
    ap.add_argument("--thinking", default=None, choices=["disabled", "adaptive"],
                    help="explicit thinking mode for models that think by default (Sonnet 5 / Opus 5); rejected by Fable")
    args = ap.parse_args()
    system_prompt = Path(args.system_file).read_text() if args.system_file else None

    api_key = None if args.dry_run else load_api_key(args.repo)
    items = [json.loads(l) for l in open(Path(args.bench) / f"{args.category}.jsonl")][args.offset : args.offset + args.n]

    # Phase 1: Stockfish contexts (sequential, one engine — engine isn't shared
    # across threads). This is the cheap part.
    engine = chess.engine.SimpleEngine.popen_uci(STOCKFISH)
    contexts = {t["task_id"]: stockfish_context(engine, t["input"], depth=args.depth) for t in items}
    engine.quit()

    if args.dry_run:
        print(f"DRY RUN ok — built {len(contexts)} engine contexts, no API calls.")
        print("\n----- sample ON prompt (item 1) -----")
        print(format_prompt(items[0], contexts[items[0]["task_id"]])[:1200])
        return

    # Phase 2: concurrent Claude calls over (item, mode). The LLM calls are the
    # bottleneck (long chain-of-thought outputs); fan them out.
    rows = {t["task_id"]: {"task_id": t["task_id"], "correct_answer": t["correct_answer"]} for t in items}
    jobs = []
    for t in items:
        for mode, context in [("off", ""), ("on", contexts[t["task_id"]])]:
            if args.modes == "both" or args.modes == mode:
                jobs.append((t, mode, context))

    usage_total = {"input_tokens": 0, "output_tokens": 0}

    def run_job(job):
        task, mode, context = job
        prompt = format_prompt(task, context)
        try:
            resp, usage = call_claude(api_key, prompt, max_tokens=args.max_tokens, system=system_prompt,
                                      model=args.model, effort=args.effort, thinking=args.thinking)
            usage_total["input_tokens"] += usage.get("input_tokens", 0)
            usage_total["output_tokens"] += usage.get("output_tokens", 0)
        except Exception as e:
            resp = f"[ERROR {e}]"
        ext, ok = extract_answer(resp)
        corr = ok and is_correct(ext, task["correct_answer"], task.get("answer_type", "single"))
        return task["task_id"], mode, ext, corr

    tally = {"off": {"correct": 0, "total": 0}, "on": {"correct": 0, "total": 0}}
    done = 0
    with ThreadPoolExecutor(max_workers=args.workers) as ex:
        futs = [ex.submit(run_job, j) for j in jobs]
        for fut in as_completed(futs):
            tid, mode, ext, corr = fut.result()
            rows[tid][mode] = {"extracted": ext, "correct": corr}
            tally[mode]["total"] += 1
            tally[mode]["correct"] += 1 if corr else 0
            done += 1
            print(f"[{done}/{len(jobs)}] {tid} {mode}={'Y' if corr else 'n'}")
    results = list(rows.values())

    def pct(m):
        return 100 * tally[m]["correct"] / max(1, tally[m]["total"])
    summary = {
        "category": args.category, "n": len(items), "model": args.model, "effort": args.effort, "thinking": args.thinking,
        "modes": args.modes, "max_tokens": args.max_tokens, "engine_depth": args.depth,
        "system_file": args.system_file, "usage": usage_total,
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
