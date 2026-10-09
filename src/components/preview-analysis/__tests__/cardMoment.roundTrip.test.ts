/**
 * A turn-1 moment from the server's lift to the page's card (pathways 4.1
 * and 4.2): fixture 07 built for real (chessdb offline), card M2 (8. Nc7+)
 * lifted by liftTurnMoment, sent through JSON as the stream sends it, read
 * by the page and matched to the card parseInsights finds in the review.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseInsights } from "@/components/AICoachInsights.parser";
import { buildCoachContract } from "@/lib/contract/builder";
import { getFenAtHalfMove } from "@/lib/contract/chessFormat";
import { renderInsightBlock } from "@/lib/contract/insightGrammar";
import { insertLadderNote } from "@/lib/contract/ladderNote";
import { liftTurnMoment } from "@/lib/contract/turnMoments";
import type { CoachContract, InsightContract } from "@/lib/contract/types";
import type {
  GameEvalInput,
  GameHeadersInput,
} from "@/lib/contract/gameEvalSchema";
import { TURN_MOMENT_EVENT } from "@/lib/coach/turnMoment";
import {
  __clearChessdbCache,
  __resetFetchForTesting,
  __setFetchForTesting,
} from "@/lib/grounding/chessdb";
import { insightMoments, ladderNoteIn, readTurnMoment } from "../cardMoment";
import { momentView } from "../followUpMoment";
import { splitInsightWhy } from "../insightWhy";

interface FixtureFile {
  moveHistory: string[];
  gameEval: GameEvalInput;
  playerColor: string;
  username?: string;
  userRating?: number;
  gameHeaders?: GameHeadersInput;
}

const FIXTURE = path.join(
  __dirname,
  "../../../lib/contract/__tests__/fixtures-real/07_knight_fork.json"
);
const fixture = JSON.parse(fs.readFileSync(FIXTURE, "utf8")) as FixtureFile;

let contract: CoachContract;
let m2: InsightContract;

beforeAll(async () => {
  __setFetchForTesting(async () => {
    throw new Error("network disabled in card-moment tests");
  });
  __clearChessdbCache();
  contract = await buildCoachContract({
    moveHistory: fixture.moveHistory,
    gameEval: fixture.gameEval,
    playerColor: fixture.playerColor,
    username: fixture.username,
    userRating: fixture.userRating,
    gameHeaders: fixture.gameHeaders,
    uid: "card-moment-round-trip",
    identity: {
      fen: getFenAtHalfMove(fixture.moveHistory, fixture.moveHistory.length),
      playerColor: fixture.playerColor || "w",
    },
  });
  m2 = contract.insights.find((i) => i.factIdPrefix === "M2")!;
}, 120_000);

afterAll(() => __resetFetchForTesting());

const BODY = [
  "You spotted a fork, but there was something even bigger hiding in plain sight.",
  "[WHY]",
  "Idea: You saw the knight fork on c7 hitting the king and the rook on a8.",
  "Problem: The queen on c1 was hanging with no defenders, and 8. Qxc1 simply takes it.",
  "Solution: 8. Qxc1 takes the queen immediately, and the engine goes on with Rb8 9. Qf4.",
  "Outcome: The fork was real, but the free queen was bigger.",
  "The takeaway: collect the most valuable free piece before you start a combination.",
  "[CONTINUATION:8:w]",
  "[/WHY]",
].join("\n");

/** The review the page holds: an intro, the card, and a later card no moment names. */
function review(card: string): string {
  const later = [
    "[INSIGHT:9:w:mistake:-2.11:-4.90:Nxa8:Qxa1]",
    "The rook was a smaller prize than it looked.",
    "[/INSIGHT]",
  ].join("\n");
  return `Let's walk through the key moments.\n\n${card}\n\n${later}`;
}

/** Lift, send, read, and draw: the prose per card the page finds. */
function drawn(finalText: string, content: string, noteLine?: string) {
  const lifted = liftTurnMoment({
    insight: m2,
    stage: "sentence_drop",
    finalText,
    noteLine,
  });
  expect(lifted).not.toBeNull();
  const frame = JSON.parse(
    JSON.stringify({ type: TURN_MOMENT_EVENT, moment: lifted })
  );
  const read = readTurnMoment(frame.moment);
  expect(read).not.toBeNull();
  const { insights } = parseInsights(content);
  return {
    lifted: lifted!,
    insights,
    moments: insightMoments([read!], content, insights),
  };
}

describe("a turn-1 moment, lifted, sent and drawn", () => {
  it("comes back as the prose the server lifted, beside its own card only", () => {
    const finalText = renderInsightBlock(m2, BODY);
    const { lifted, insights, moments } = drawn(finalText, review(finalText));
    expect(insights.map((i) => i.playedMove)).toEqual(["Nc7+", "Nxa8"]);
    expect(moments[1]).toBeNull();
    expect(moments[0]).toEqual({
      idea: lifted.idea,
      happens: lifted.happens,
      proof: lifted.proof,
      lesson: lifted.lesson,
      question: null,
      more: lifted.more,
      omitted: [],
    });
  });

  it("draws what the prose card draws, without the labels, the lede or the lowercase", () => {
    const finalText = renderInsightBlock(m2, BODY);
    const { insights, moments } = drawn(finalText, review(finalText));
    const view = momentView(moments[0]!);
    const page = splitInsightWhy(insights[0].why);
    expect(view.lines.map((l) => l.text)).toEqual([
      "You saw the knight fork on c7 hitting the king and the rook on a8.",
      "The queen on c1 was hanging with no defenders, and 8. Qxc1 simply takes it.",
    ]);
    expect(page.lead).toBe(
      view.lines
        .map((l) => `${l.field === "idea" ? "Idea" : "Problem"}: ${l.text}`)
        .join("\n")
    );
    expect(view.more).toBe(page.rest);
    expect(page.lesson).toBe(
      "collect the most valuable free piece before you start a combination."
    );
    expect(view.lesson).toBe(
      "Collect the most valuable free piece before you start a combination."
    );
    expect(JSON.stringify(view)).not.toContain("something even bigger");
  });

  it("one changed character in the card's text and the card is the prose card", () => {
    const finalText = renderInsightBlock(m2, BODY);
    const lifted = liftTurnMoment({ insight: m2, stage: "pass", finalText })!;
    const read = readTurnMoment(JSON.parse(JSON.stringify(lifted)))!;
    const changed = review(finalText).replace("bigger.", "bigger!");
    const { insights } = parseInsights(changed);
    expect(insightMoments([read], changed, insights)).toEqual([null, null]);
  });

  it("a noted card: the moment leaves the note out, and the card finds it in the lede", () => {
    const NOTE = "I left out a tactic I couldn't check.";
    for (const body of [BODY, BODY.replace(/^[^\n]*\n/, "")]) {
      const finalText = renderInsightBlock(m2, insertLadderNote(body, NOTE));
      const { insights, moments } = drawn(finalText, review(finalText), NOTE);
      expect(moments[0]).not.toBeNull();
      expect(JSON.stringify(moments[0])).not.toContain("couldn't check");
      expect(ladderNoteIn(insights[0].headline)).toBe(NOTE);
    }
    // A card with no [WHY] is cut from its lede, note left out.
    const flowing =
      "You went for the fork.\n\nThe queen on c1 was free.\n\nTake the free piece first.";
    const finalText = renderInsightBlock(m2, insertLadderNote(flowing, NOTE));
    const { insights, moments } = drawn(finalText, review(finalText), NOTE);
    expect(moments[0]).not.toBeNull();
    expect(JSON.stringify(moments[0])).not.toContain("couldn't check");
    expect(ladderNoteIn(insights[0].headline)).toBe(NOTE);
  });
});
