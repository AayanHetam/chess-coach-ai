import { TelemetryEvent, FireReason, FinalOutcome } from "./types";

export interface CreateEventOpts {
  check_name: string;
  fire_reason: FireReason;
  llm_span?: string;
  expected?: unknown;
  actual?: unknown;
  retry_count?: number;
  final_outcome?: FinalOutcome | null;
  context: {
    fen?: string;
    move_san?: string;
    player_perspective?: "white" | "black";
    correlation_id: string;
  };
}

/**
 * Create a TelemetryEvent. Library code accumulates events into ValidatorResult
 * and RegenerateResult; route handlers (PR 1.C) consume the accumulated list
 * and fan out to the logger. Validators never call logger directly so tests
 * don't pollute production telemetry sinks.
 */
export function createTelemetryEvent(opts: CreateEventOpts): TelemetryEvent {
  return {
    check_name: opts.check_name,
    fire_reason: opts.fire_reason,
    llm_span: opts.llm_span ?? "",
    expected: opts.expected ?? null,
    actual: opts.actual ?? null,
    retry_count: opts.retry_count ?? 0,
    final_outcome: opts.final_outcome ?? null,
    context: opts.context,
    timestamp_ms: Date.now(),
  };
}

export function generateCorrelationId(): string {
  const rand = () => Math.random().toString(36).slice(2, 10);
  return `cm-${Date.now().toString(36)}-${rand()}-${rand()}`;
}

export function mergeTelemetry(...lists: TelemetryEvent[][]): TelemetryEvent[] {
  return lists.flat();
}
