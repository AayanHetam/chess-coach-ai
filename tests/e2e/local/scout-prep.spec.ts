import { test, expect, type Page } from "@playwright/test";
import { Chess } from "chess.js";

/**
 * The "Customize vs me" prep report, driven in a real browser.
 *
 * /api/scout requires a session and CI has no credentials, so the games fetch
 * and the Lichess cloud-eval are stubbed. Everything else is real: the page, the
 * opening tree, the position index, the screen, the search, and the panel. A
 * throw anywhere in that chain takes the whole /scout page down and `next build`
 * never exercises it, which is why this exists rather than a render test alone.
 *
 * The fixture is a planted weakness — they answer 1.e4 with c5 every time and
 * collapse after 2.c3 — so the CONFIRMED tier is exercised. That tier is the one
 * that can never be reached by accident, and the one whose wording makes a claim
 * about a real person.
 */

const THEM = "planted_opponent";

/** One archive game, in the shape /api/scout returns. */
function game(id: number, moves: string[], result: string) {
  return {
    id: `g${id}`,
    platform: "chess.com",
    moves,
    numMoves: moves.length,
    whiteUsername: "someone",
    blackUsername: THEM,
    whiteRating: 1500,
    blackRating: 1500,
    result,
    timeControl: "300",
    timeClass: "blitz",
    termination: "resign",
    // Fixed timestamps: the index decays games by age against their newest, so
    // a moving "now" would change the weights and make this flaky.
    date: Date.UTC(2026, 0, 1) + id * 60_000,
  };
}

function archive() {
  const games: ReturnType<typeof game>[] = [];
  let id = 0;
  // Sound: they hold their own in the open games...
  for (let i = 0; i < 300; i++) {
    games.push(game(id++, ["e4", "e5", "Nf3", "Nc6"], i < 150 ? "0-1" : "1-0"));
  }
  // ...and in the Sicilian, as long as you play the main line.
  for (let i = 0; i < 200; i++) {
    games.push(game(id++, ["e4", "c5", "Nf3", "d6", "d4", "cxd4"], i < 100 ? "0-1" : "1-0"));
  }
  // The hole is YOUR second move, not their first. c5 is common to both
  // branches, so only 2.c3 separates them — which forces the panel to name a
  // move you choose rather than one they played, and mirrors the real case
  // this was built from (an opponent who collapses specifically in the Alapin).
  for (let i = 0; i < 140; i++) {
    games.push(game(id++, ["e4", "c5", "c3", "Nf6", "e5", "Nd5", "d4", "cxd4"], i < 14 ? "0-1" : "1-0"));
  }
  return {
    username: THEM,
    platform: "chess.com",
    games,
    totalGames: games.length,
    dateRange: { from: games[0].date, to: games[games.length - 1].date },
  };
}

/** The moves they have actually met, so the prepared line runs on. */
const SCRIPT: Record<string, string> = {
  "rnbqkb1r/pp1ppppp/5n2/2p5/4P3/2P5/PP1P1PPP/RNBQKBNR w KQkq -": "e5",
  "rnbqkb1r/pp1ppppp/8/2pnP3/8/2P5/PP1P1PPP/RNBQKBNR w KQkq -": "d4",
};

async function stubNetwork(page: Page) {
  await page.route("**/api/scout", route =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(archive()) })
  );
  // Deterministic and offline. A flat evaluation means nothing here can pass on
  // the strength of an engine edge — the results signal has to carry it.
  //
  // The move has to be LEGAL in the position asked about, not a fixed string. A
  // constant reply is illegal everywhere except the opening move, so the
  // prepared line stops at "no engine answer" on its first ply and the whole
  // continuation goes untested while the test still passes.
  await page.route("**/lichess.org/api/cloud-eval**", route => {
    const fen = decodeURIComponent(new URL(route.request().url()).searchParams.get("fen") ?? "");
    let uci = "e2e4";
    try {
      const board = new Chess(fen);
      const scripted = SCRIPT[fen.split(" ").slice(0, 4).join(" ")];
      const move = board.move(scripted ?? board.moves()[0]);
      if (move) uci = move.from + move.to + (move.promotion ?? "");
    } catch {
      /* fall through to the default, which the caller treats as unusable */
    }
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ depth: 50, pvs: [{ moves: uci, cp: 20 }] }),
    });
  });
}

async function dismissCookies(page: Page) {
  // The banner overlays the page bottom and swallows clicks on mobile.
  const agree = page.getByRole("button", { name: /I agree|Accept/i }).first();
  if (await agree.isVisible().catch(() => false)) await agree.click();
}

async function runScout(page: Page) {
  await stubNetwork(page);
  const crashes: string[] = [];
  page.on("pageerror", e => crashes.push(String(e)));

  await page.goto("/scout");
  await dismissCookies(page);

  const input = page.locator('input[type="text"]').first();
  await input.fill(THEM);
  await input.press("Enter");

  await expect(page.getByText(/Customize vs me/i).first()).toBeVisible({ timeout: 60_000 });
  return crashes;
}

test.describe("scout prep report", () => {
  test("builds a confirmed weakness and says what it rests on", async ({ page }) => {
    const crashes = await runScout(page);

    // Idle state first — the run costs cloud calls, so it must be opt-in.
    const build = page.getByRole("button", { name: /BUILD MY PREP/i });
    await expect(build).toBeVisible();

    await build.scrollIntoViewIfNeeded();
    await build.click();

    await expect(page.getByText(/Weakness confirmed/i).first()).toBeVisible({ timeout: 120_000 });

    // The instruction must name the move YOU choose. c5 is theirs and appears in
    // a sound branch too, so anything short of c3 means the search stopped at a
    // move nobody can act on.
    await expect(page.getByText(/Play\s*c3/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/1\.e4\s*c5\s*2\.c3/i).first()).toBeVisible();

    // The continuation, not just the entry. Steering them somewhere is only
    // half the report; the other half is what to play once there.
    await expect(page.getByText(/The lines? from here/i).first()).toBeVisible();
    await expect(page.getByText(/Nd5/).first()).toBeVisible();

    // Master context comes from a second request against the real corpus, so
    // this also proves /api/master-ideas answers for the positions the prep
    // actually lands on rather than for a hand-picked FEN.
    await expect(page.getByText(/master games here/i).first()).toBeVisible({ timeout: 20_000 });

    // Evidence must be on screen, not behind a disclosure: a claim about a
    // person is not readable without the sample it came from.
    await expect(page.getByText(/independent lines/i).first()).toBeVisible();

    expect(crashes, `page errors: ${crashes.join("\n")}`).toHaveLength(0);
  });

  test("switching colour clears the previous report rather than leaving it stale", async ({
    page,
  }) => {
    const crashes = await runScout(page);

    await page.getByRole("button", { name: /BUILD MY PREP/i }).click();
    await expect(page.getByText(/Weakness confirmed/i).first()).toBeVisible({ timeout: 120_000 });

    // The fixture only has them as Black, so scouting their White games has
    // nothing to report — and the previous colour's lines must not linger.
    await page.getByRole("button", { name: /YOU AS BLACK/i }).click();
    await expect(page.getByText(/Weakness confirmed/i)).toHaveCount(0);
    await expect(page.getByRole("button", { name: /BUILD MY PREP/i })).toBeVisible();

    expect(crashes, `page errors: ${crashes.join("\n")}`).toHaveLength(0);
  });
});
