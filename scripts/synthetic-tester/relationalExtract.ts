/**
 * LLM claim extractor (Phase 0). Turns the coach's natural-language analysis
 * into STRUCTURED relational claims that the deterministic verifier can check.
 *
 * This is the only noisy step in the scorer (the verifier is exact), which is
 * why OBJECTIVE.md keeps the gate human. To keep the scorer's own error low the
 * extractor is told to be CONSERVATIVE: only emit a claim when the squares and
 * colors are unambiguous (it is handed the exact piece inventory), and to skip
 * vague/strategic commentary that has no board-checkable content. A missed
 * claim costs us a false-negative on one line; a hallucinated claim would cost
 * us a spurious "contradiction", so when in doubt it must omit.
 */
import { Chess, type Square } from "chess.js";
import { describePosition, type RelationalClaim, type RelationKind } from "./relationalVerify";
import type { CostTracker } from "./costTracker";

const EXTRACT_MODEL = "claude-haiku-4-5-20251001";

const SYSTEM_PROMPT = `You extract VERIFIABLE chess claims from a coach's analysis of one position.

You are given the exact piece inventory of the current (final) position, and optionally the full move history with ply numbers. Output ONLY a JSON array (no prose, no code fences) of claim objects. Each claim object:
{
  "kind": "attack" | "capture" | "defense" | "presence" | "line" | "pin",
  "pieceColor": "w" | "b",            // color of the acting/pinning piece (for attack/capture/defense/pin)
  "pieceType": "p"|"n"|"b"|"r"|"q"|"k", // OPTIONAL, only if the coach named the piece type
  "fromSquare": "e2",                  // OPTIONAL, only if the coach named the acting/pinning square
  "targetSquare": "h7",                // the square acted on / occupied / PINNED (for pin: the pinned piece's square)
  "pinnedToSquare": "e1",              // for kind "pin" only: the square of the piece BEHIND the pin (king/queen that would be exposed)
  "expectedPiece": {"type":"b","color":"b"}, // for kind "presence" only
  "line": ["Bxh7+","Kxh7","Qh5+"],     // for kind "line" only (SAN)
  "precedingLine": ["e4","e5"],        // OPTIONAL: SAN moves that set up the position the claim is about (FORWARD variations only — moves not yet played)
  "moveRefPly": 11,                    // OPTIONAL integer: the ply number this claim is anchored to (see rules below)
  "rawText": "the exact phrase you extracted this from"
}

RULES:
- Map words to squares using the supplied inventory (or move history for past positions). If you cannot pin down the square or color unambiguously, OMIT the claim. Never guess a square.
- "capture": the coach says a piece can take an enemy piece on a square.
- "attack"/"threat": the coach says a piece attacks/threatens/hits a square (no capture needed).
- "defense"/"protects"/"guards": a friendly piece defends the piece on a square. Use this ONLY for genuine defense of a friendly piece on a square — NOT for pins.
- "pin": the coach says a piece immobilizes / freezes / pins / skewers a piece because moving it would expose a more valuable piece behind it. Extract as:
    { "kind": "pin", "pieceColor": <pinner color>, "fromSquare": <pinner sq if named>, "targetSquare": <pinned piece sq>, "pinnedToSquare": <behind piece sq if named>, ... }
  Distinguish pin from defense: "Bb4 pins the Nc3 to the king on e1" → pin. "Nc3 defends e4" → defense.
  If the coach says "pins" or "freezes" without naming the target behind the pin, omit pinnedToSquare.
- "presence": the coach states a specific piece sits on a specific square.
- "line": the coach gives a concrete move sequence (extract it as SAN).

CRITICAL — position anchoring (read carefully):
1. Claims about the CURRENT position (inventory above, no past moves referenced): extract normally, no moveRefPly, no precedingLine.
2. FORWARD variations from the current position ("after Bxh7+ Kxh7, the queen has Qh5+"): put the forward moves in precedingLine. NEVER put already-played game moves in precedingLine — they cannot be replayed from the current position.
3. Claims about a PAST game position (coach references a specific concrete relationship at a past move, e.g. "after 6.Nxf7 the bishop attacked the rook on f7"): set moveRefPly = the ply number from the move history. Only include if a specific piece/square relationship is checkable. White's move N = ply 2N-1; Black's move N = ply 2N.
4. PAST-TENSE CLAIMS — CRITICAL: If the relational verb is past-tense (was attacking, was defending, was threatening, were protecting, was eyeing, had attacked, was pinning, etc.) → ONLY extract if you can assign a specific moveRefPly from the move history. If the ply is ambiguous or unknown → SKIP entirely. NEVER emit a past-tense relational claim without moveRefPly — it will be scored against the wrong (final) FEN and produce a spurious contradiction.
5. Pure past-move NARRATION with no board-checkable claim ("you played 5...Nxg5 winning a piece", "6.Nxf7 forked queen and rook" when describing what already happened): SKIP — these are event descriptions, not claims about a board state.
6. PRESENCE claims — historical piece references: if the coach says "the bishop on c4" but c4 is NOT in the current inventory at that square → only emit with a specific moveRefPly anchoring to when that piece was there. Otherwise SKIP. Never emit a presence claim for a piece that is not in the current position inventory without a ply anchor.

- A piece simply being ON a square is NOT an attack/defense claim. Only emit attack/capture/defense when the coach asserts a relationship to a DIFFERENT target square. Never emit a claim where the acting square equals the target square.
- SKIP vague/evaluative statements ("White is better", "good development", "active pieces") — they are not board-checkable.
- Output [] if there are no concrete checkable claims.`;

// Matches "was/were + (been +)? <relational verb>ing" — past progressive (e.g. "was attacking").
const PAST_TENSE_RE =
  /\b(was|were)\s+(been\s+)?(attack|defend|threaten|protect|guard|eye|pin|hit|target)ing\b/i;

/**
 * Returns true when rawText contains a past-tense auxiliary + relational verb pattern.
 * These claims describe historical board states and MUST carry moveRefPly to be scored
 * against the right FEN; without it they silently score against the final position.
 */
export function isPastTenseClaim(rawText: string): boolean {
  return PAST_TENSE_RE.test(rawText);
}

/**
 * Drops claims that would produce spurious contradictions due to FEN mismatch:
 *   1. Past-tense relational claims without moveRefPly (scored against wrong FEN).
 *   2. Presence claims for pieces absent from the current FEN without a ply anchor.
 *   3. Attack/capture/defense/pin claims where fromSquare is empty in the final FEN
 *      without a ply anchor — these are historical narrations, not current-position claims.
 */
export function filterClaims(claims: RelationalClaim[], fen: string): RelationalClaim[] {
  let board: Chess | null = null;
  try {
    board = new Chess(fen);
  } catch {
    // Invalid FEN — skip the stale-presence check but still apply past-tense filter.
  }

  return claims.filter((c) => {
    // 1. Drop past-tense relational claims with no ply anchor.
    if (!c.moveRefPly && isPastTenseClaim(c.rawText)) return false;

    // 2. Drop presence claims for pieces not in the current FEN.
    if (c.kind === "presence" && !c.moveRefPly && c.targetSquare && c.expectedPiece && board) {
      const actual = board.get(c.targetSquare as Square);
      if (!actual || actual.type !== c.expectedPiece.type || actual.color !== c.expectedPiece.color) {
        return false;
      }
    }

    // 3. Drop attack/capture/defense/pin claims where the stated fromSquare is empty
    //    in the final FEN and there's no ply anchor. An empty attacker square means
    //    the claim is a historical narration (the piece moved/was captured) and
    //    cannot be verified against the final position — drop rather than flag false.
    if (
      !c.moveRefPly &&
      c.fromSquare &&
      board &&
      (c.kind === "attack" || c.kind === "capture" || c.kind === "defense" || c.kind === "pin")
    ) {
      const occupant = board.get(c.fromSquare as Square);
      if (!occupant) return false;
    }

    return true;
  });
}

const FILE_SQ = /^[a-h][1-8]$/;
const TYPES = new Set(["p", "n", "b", "r", "q", "k"]);
const KINDS = new Set<RelationKind>(["attack", "capture", "defense", "presence", "line", "pin"]);

function coerceClaim(raw: unknown): RelationalClaim | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind = o.kind as RelationKind;
  if (!KINDS.has(kind)) return null;

  const claim: RelationalClaim = { kind, rawText: typeof o.rawText === "string" ? o.rawText : "" };

  const sq = (v: unknown): string | undefined =>
    typeof v === "string" && FILE_SQ.test(v) ? v : undefined;
  const color = (v: unknown): "w" | "b" | undefined => (v === "w" || v === "b" ? v : undefined);
  const type = (v: unknown): RelationalClaim["pieceType"] =>
    typeof v === "string" && TYPES.has(v) ? (v as RelationalClaim["pieceType"]) : undefined;

  claim.fromSquare = sq(o.fromSquare) as RelationalClaim["fromSquare"];
  claim.targetSquare = sq(o.targetSquare) as RelationalClaim["targetSquare"];
  claim.pieceType = type(o.pieceType);
  claim.pieceColor = color(o.pieceColor);
  claim.pinnedToSquare = sq(o.pinnedToSquare) as RelationalClaim["pinnedToSquare"];
  if (Array.isArray(o.line)) claim.line = o.line.filter((m): m is string => typeof m === "string");
  if (Array.isArray(o.precedingLine))
    claim.precedingLine = o.precedingLine.filter((m): m is string => typeof m === "string");
  if (typeof o.moveRefPly === "number" && Number.isInteger(o.moveRefPly) && o.moveRefPly >= 1)
    claim.moveRefPly = o.moveRefPly;
  if (o.expectedPiece && typeof o.expectedPiece === "object") {
    const ep = o.expectedPiece as Record<string, unknown>;
    const t = type(ep.type);
    const cc = color(ep.color);
    if (t && cc) claim.expectedPiece = { type: t, color: cc };
  }

  // Reject claims missing the fields their kind requires (conservative).
  if (kind === "line" && (!claim.line || claim.line.length === 0)) return null;
  if (kind === "presence" && (!claim.targetSquare || !claim.expectedPiece)) return null;
  if ((kind === "attack" || kind === "capture" || kind === "defense") && (!claim.targetSquare || !claim.pieceColor))
    return null;
  if (kind === "pin" && (!claim.targetSquare || !claim.pieceColor)) return null;
  // A piece does not "attack/defend" its own square — drop nonsensical self-claims
  // (the extractor sometimes turns "the knight on e4 is active" into attack e4->e4).
  if (
    (kind === "attack" || kind === "capture" || kind === "defense") &&
    claim.fromSquare &&
    claim.fromSquare === claim.targetSquare
  )
    return null;

  return claim;
}

function parseClaims(text: string): RelationalClaim[] {
  let body = text.trim();
  // strip ```json fences if the model added them
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) body = fence[1].trim();
  // find the first JSON array
  const start = body.indexOf("[");
  const end = body.lastIndexOf("]");
  if (start === -1 || end === -1 || end < start) return [];
  let arr: unknown;
  try {
    arr = JSON.parse(body.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!Array.isArray(arr)) return [];
  return arr.map(coerceClaim).filter((c): c is RelationalClaim => c !== null);
}

export interface ExtractArgs {
  apiKey: string;
  coachText: string;
  fen: string;
  costTracker?: CostTracker;
  /**
   * SAN move history of the full game, index 0 = ply 1 (white's first move).
   * When provided, the extractor receives a ply-annotated move list so it can
   * populate moveRefPly for claims about past positions.
   */
  moveHistory?: string[];
}

export interface ExtractResult {
  ok: boolean;
  claims: RelationalClaim[];
  errorMessage?: string;
}

/** Format the SAN move history as ply-annotated lines, white move N = ply 2N-1, black = 2N. */
function formatMoveHistory(moveHistory: string[]): string {
  const lines: string[] = [];
  for (let i = 0; i < moveHistory.length; i++) {
    const ply = i + 1;
    const fullMove = Math.ceil(ply / 2);
    const side = ply % 2 === 1 ? "White" : "Black";
    lines.push(`  Ply ${String(ply).padStart(2, " ")} (${side} ${fullMove}): ${moveHistory[i]}`);
  }
  return lines.join("\n");
}

export async function extractRelationalClaims(args: ExtractArgs): Promise<ExtractResult> {
  const inventory = describePosition(args.fen);
  const moveHistorySection =
    args.moveHistory && args.moveHistory.length > 0
      ? `\nGame move history (use ply numbers for moveRefPly on past-position claims):\n${formatMoveHistory(args.moveHistory)}\n`
      : "";
  const userContent = `Position (FEN): ${args.fen}\n${inventory}${moveHistorySection}\nCoach analysis:\n${args.coachText}\n\nExtract the verifiable claims as a JSON array.`;

  const estIn = Math.ceil((SYSTEM_PROMPT.length + userContent.length) / 4);
  const estOut = 400;
  if (args.costTracker?.exceedsCap(args.costTracker.estimate(EXTRACT_MODEL, estIn, estOut))) {
    return { ok: false, claims: [], errorMessage: "cost_cap_would_exceed" };
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": args.apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: EXTRACT_MODEL,
        max_tokens: 1024,
        temperature: 0,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userContent }],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, claims: [], errorMessage: `${res.status} ${text.slice(0, 200)}` };
    }
    const json = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = json.content?.find((b) => b.type === "text")?.text || "";
    args.costTracker?.addUsage(EXTRACT_MODEL, json.usage?.input_tokens ?? estIn, json.usage?.output_tokens ?? estOut);
    return { ok: true, claims: filterClaims(parseClaims(text), args.fen) };
  } catch (err) {
    return { ok: false, claims: [], errorMessage: String(err) };
  }
}

// Exposed for unit testing the parser and filters without an API call.
export const __test = { parseClaims, coerceClaim, isPastTenseClaim, filterClaims };
