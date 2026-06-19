/**
 * Per-1k-token rates in USD. TODO: update if Anthropic prices change.
 * Sources: anthropic.com/pricing as of 2026-06 (Sonnet 4.6 / Haiku 4.5).
 */
const RATES = {
  "claude-sonnet-4-6": { input: 0.003, output: 0.015 },
  "claude-haiku-4-5-20251001": { input: 0.001, output: 0.005 },
} as const;

export type ModelId = keyof typeof RATES;

export class CostTracker {
  private spent = 0;
  constructor(private capUsd: number) {}

  addUsage(model: ModelId, inputTokens: number, outputTokens: number): number {
    const r = RATES[model];
    const cost = (inputTokens * r.input + outputTokens * r.output) / 1000;
    this.spent += cost;
    return cost;
  }

  /** Estimate the cost of an upcoming call so we can abort BEFORE making it. */
  estimate(model: ModelId, inputTokens: number, outputTokens: number): number {
    const r = RATES[model];
    return (inputTokens * r.input + outputTokens * r.output) / 1000;
  }

  totalSpent(): number {
    return this.spent;
  }

  remaining(): number {
    return this.capUsd - this.spent;
  }

  exceedsCap(prospectiveCost: number): boolean {
    return this.spent + prospectiveCost > this.capUsd;
  }
}
