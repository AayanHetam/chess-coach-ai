import { openSync, writeSync, fsyncSync, closeSync, writeFileSync } from "fs";
import { join } from "path";

export interface Row {
  timestamp: string;
  run_id: string;
  run_seed: number;
  app_git_sha: string;

  // Stage C category-dispatch fields (blank for legacy game-loop rows;
  // populated for --force-category / --category-mix runs).
  turn_idx?: number | "";
  category?: string;
  generator_metadata?: string; // JSON-stringified per-generator metadata
  body_extensions?: string; // JSON-stringified per-generator body extensions
  mock_llm?: "true" | "false" | "";

  game_id: number | "";
  white: string;
  black: string;
  persona: string;
  persona_file_hash: string;

  ply: number | "";
  fen: string;
  last_move: string;
  last_n_moves: string;
  checkpoint_kind: "swing" | "quiet" | "opening" | "endgame" | "";
  eval_before_cp: number | "";
  eval_after_cp: number | "";
  swing_cp: number | "";
  move_classification: string;

  student_question: string;
  chat_response: string;

  context_id: string;
  analysis_latency_ms: number | "";
  chat_latency_ms: number | "";
  model_chat: string;
  model_analysis: string;
  personality_id: string;
  base_url: string;

  validator_score: number | "";
  validator_issue_count: number | "";
  validator_issues_json: string;

  prompt_tokens: number | "";
  completion_tokens: number | "";
  est_cost_usd: number | "";

  http_status: number | "";
  error_message: string;

  grade: string;
  failure_mode: string;
  notes: string;
}

const COLUMNS: Array<keyof Row> = [
  "timestamp", "run_id", "run_seed", "app_git_sha",
  "turn_idx", "category", "generator_metadata", "body_extensions", "mock_llm",
  "game_id", "white", "black", "persona", "persona_file_hash",
  "ply", "fen", "last_move", "last_n_moves", "checkpoint_kind",
  "eval_before_cp", "eval_after_cp", "swing_cp", "move_classification",
  "student_question", "chat_response",
  "context_id", "analysis_latency_ms", "chat_latency_ms",
  "model_chat", "model_analysis", "personality_id", "base_url",
  "validator_score", "validator_issue_count", "validator_issues_json",
  "prompt_tokens", "completion_tokens", "est_cost_usd",
  "http_status", "error_message",
  "grade", "failure_mode", "notes",
];

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export class CsvWriter {
  private fd: number;
  private rowsWritten = 0;

  constructor(public readonly path: string) {
    this.fd = openSync(path, "w");
    writeSync(this.fd, COLUMNS.join(",") + "\n");
    fsyncSync(this.fd);
  }

  appendRow(row: Row): void {
    const line = COLUMNS.map((k) => csvEscape(row[k])).join(",") + "\n";
    writeSync(this.fd, line);
    fsyncSync(this.fd);
    this.rowsWritten++;
  }

  count(): number {
    return this.rowsWritten;
  }

  close(): void {
    try {
      closeSync(this.fd);
    } catch {
      /* ignore */
    }
  }
}

/* ──────────────────────────────────────────────────────────────────────────
 * Run metadata sidecar
 * ────────────────────────────────────────────────────────────────────────── */

export interface RunMeta {
  run_id: string;
  started_at: string;
  ended_at?: string;
  seed: number;
  app_git_sha: string;
  base_url: string;
  cli_args: string[];
  options: {
    games: number;
    questions: number;
    personas: string[];
    concurrency: number;
    max_cost_usd: number;
    personality_id: string;
    min_plies: number;
    stockfish_depth: number;
    persona_temperature: number;
  };
  persona_files: Record<string, { path: string; sha256: string; version: number; date_calibrated: string; source: string }>;
  totals?: {
    rows_written: number;
    cost_usd_spent: number;
    aborted_reason?: string;
  };
}

export function writeMeta(runDir: string, meta: RunMeta): void {
  writeFileSync(join(runDir, `${meta.run_id}.meta.json`), JSON.stringify(meta, null, 2));
}
