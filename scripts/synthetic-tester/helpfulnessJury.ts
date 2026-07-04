/**
 * helpfulnessJury — 2-model aggregation of the helpfulness rubric.
 *
 * Runs judgeResponse for each of >=2 distinct Claude models (default: the
 * sonnet-4-6 strong judge + the haiku-4-5 cross-check — both real ids priced in
 * costTracker's RATES), then aggregates per dimension:
 *   - a dim is applicable in the aggregate iff the STRONG judge marked it
 *     applicable (the cross-check cannot veto applicability);
 *   - aggregate EV = 0.6*EV_strong + 0.4*EV_crosscheck over dims both judges
 *     scored (keeps the cross-check as a check, not a veto);
 *   - the gate cap is re-applied on the aggregate.
 *
 * The `call` seam is forwarded to judgeResponse so the whole jury runs with NO
 * network in tests.
 */
import { judgeResponse, assembleRubric, type JudgeModel, type AnthropicReq, type AnthropicRes } from "./helpfulnessJudge";
import type { CostTracker } from "./costTracker";
import type { ScoreResult } from "./relationalScorer";
import type { JudgePacket, JuryResult, RubricResult, DimScore, DimId } from "./helpfulnessTypes";

const STRONG: JudgeModel = "claude-sonnet-4-6";
const CROSSCHECK: JudgeModel = "claude-haiku-4-5-20251001";
const STRONG_WEIGHT = 0.6;
const CROSS_WEIGHT = 0.4;
const ALL_DIMS: DimId[] = [1, 2, 3, 4, 5, 6, 7];

export interface JuryArgs {
  apiKey: string;
  packet: JudgePacket;
  coachText: string;
  gate: ScoreResult;
  costTracker?: CostTracker;
  /** default both: [strong, crosscheck]. First entry is treated as the strong judge. */
  judges?: JudgeModel[];
  /** forwarded to judgeResponse for network-free tests */
  call?: (req: AnthropicReq, apiKey: string) => Promise<AnthropicRes>;
}

/**
 * Weighted-mean aggregate over per-judge RubricResults. The FIRST judge is the
 * strong judge (weight 0.6); remaining judges share the cross-check weight 0.4.
 * Applicability follows the strong judge.
 */
export function aggregateRubrics(
  perJudge: Array<{ model: string; result: RubricResult }>,
  gate: ScoreResult,
  packet: JudgePacket
): RubricResult {
  if (perJudge.length === 0) {
    // Degenerate: no judges. All dims N/A.
    const dims: DimScore[] = ALL_DIMS.map((d) => ({
      dim: d, applicable: false, naReason: "no judges", expected: 0, rationale: "",
    }));
    return assembleRubric(dims, gate, packet);
  }

  const strong = perJudge[0].result;
  const others = perJudge.slice(1).map((p) => p.result);

  const strongByDim = new Map<DimId, DimScore>(strong.dims.map((d) => [d.dim, d]));

  const aggDims: DimScore[] = ALL_DIMS.map((dimId) => {
    const sDim = strongByDim.get(dimId);
    // Applicability follows the strong judge.
    if (!sDim || !sDim.applicable) {
      return {
        dim: dimId,
        applicable: false,
        naReason: sDim?.naReason ?? "strong judge marked N/A",
        expected: 0,
        rationale: sDim?.rationale ?? "",
      };
    }

    // Cross-check judges that ALSO marked this dim applicable contribute.
    const crossEVs: number[] = [];
    for (const o of others) {
      const od = o.dims.find((d) => d.dim === dimId);
      if (od && od.applicable) crossEVs.push(od.expected);
    }

    let expected: number;
    if (crossEVs.length === 0) {
      // No cross-check on this dim -> use the strong judge alone.
      expected = sDim.expected;
    } else {
      const crossMean = crossEVs.reduce((a, b) => a + b, 0) / crossEVs.length;
      expected = STRONG_WEIGHT * sDim.expected + CROSS_WEIGHT * crossMean;
    }

    return {
      dim: dimId,
      applicable: true,
      expected,
      probs: sDim.probs,
      rationale: sDim.rationale,
    };
  });

  // assembleRubric recomputes rawTotal/maxApplicable/normalized and re-applies
  // the gate cap (dim-1==0 or GATE contradiction).
  return assembleRubric(aggDims, gate, packet);
}

export async function juryGrade(args: JuryArgs): Promise<JuryResult> {
  const judges = args.judges && args.judges.length > 0 ? args.judges : [STRONG, CROSSCHECK];
  const spentBefore = args.costTracker?.totalSpent() ?? 0;

  const perJudge: Array<{ model: string; result: RubricResult }> = [];
  for (const model of judges) {
    const result = await judgeResponse({
      apiKey: args.apiKey,
      model,
      packet: args.packet,
      coachText: args.coachText,
      gate: args.gate,
      costTracker: args.costTracker,
      call: args.call,
    });
    perJudge.push({ model, result });
  }

  const aggregate = aggregateRubrics(perJudge, args.gate, args.packet);
  const costUsd = (args.costTracker?.totalSpent() ?? 0) - spentBefore;

  return { perJudge, aggregate, gateInput: args.gate, costUsd };
}
