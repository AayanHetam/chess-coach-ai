import { test, expect, type Locator, type Page } from "@playwright/test";
import { stubMaiaHealthy, stubSignedIn, throttleLikeAPhone } from "../helpers";

/**
 * The board answers a what-if before the coach does.
 *
 * "what about 8. Qxc1 instead?" names an alternative. The page reads it
 * before any fetch, scores the asked move beside the move the game played
 * in one search on the client's own engine, draws the asked move on the
 * board through the exploration preview and its line under the question,
 * and keeps deepening while the coach's words arrive. The Phase 2 exit of
 * the pathway: the line is drawn within two seconds on the throttled phone
 * leg at a stable depth, and its two numbers come from one search.
 *
 * No LLM is reached: the review and the follow-up are stubbed. The engine
 * is NOT blocked (the answer comes from it), so the spec waits for the
 * review's sweep and skips, like the other coach specs, on a machine where
 * it never finishes. The throttle goes on only after the sweep: the exit
 * criterion is about the what-if, not the boot.
 */

/** Fixture 07: 8. Nc7+ forks king and rook while 8. Qxc1 takes a free queen. */
const PGN = [
  '[White "E2E White"]',
  '[Black "E2E Black"]',
  '[Result "0-1"]',
  "",
  "1. e4 c5 2. Nf3 Nc6 3. d4 cxd4 4. Nxd4 Qb6 5. Nf3 Qxb2 6. Na3 Qxa1 7. Nb5 Qxc1 8. Nc7+ Kd8 9. Nxa8 Qxd1+ 10. Kxd1 e5 0-1",
].join("\n");

const REVIEW = [
  "Let's walk through the key moments.",
  "",
  "[INSIGHT:8:w:blunder:+2.84:-2.11:Nc7+:Qxc1]",
  "You spotted a fork, but the free queen was bigger.",
  "[WHY]",
  "Idea: You saw the knight fork on c7 hitting the king and the rook on a8.",
  "Problem: The queen on c1 was hanging with no defenders.",
  "Solution: 8. Qxc1 takes the queen immediately.",
  "Outcome: A full queen ahead instead of a lost knight.",
  "The takeaway: collect the most valuable free piece before you start a combination.",
  "[/WHY]",
  "[/INSIGHT]",
].join("\n");

/** The coach's words about the asked move, anchored on the game's move there. */
const FOLLOWUP =
  "Yes: 8. Qxc1 simply takes the queen, and after 8... Rb8 9. Qf4 you are a queen ahead.\n\nLesson: collect what is hanging before you start a combination.";

/**
 * `chatDelayMs` holds the coach's words back: by default a little, so the
 * engine is seen to answer first; at 0 the words (and their anchor) come
 * before the line, and the anchor's jump must wait for it.
 */
async function stubCoach(page: Page, { chatDelayMs = 1500 } = {}) {
  await stubSignedIn(page);
  await stubMaiaHealthy(page);
  await page.route("**/api/mistake-puzzles", (r) =>
    r.fulfill({ json: { puzzles: [], recommendations: [] } })
  );
  await page.route("**/api/enhanced-analysis", async (route) => {
    const body =
      `data: ${JSON.stringify({ type: "text", delta: REVIEW })}\n\n` +
      `data: ${JSON.stringify({ type: "done", metadata: { contextId: "e2e-whatif-1" } })}\n\n`;
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/event-stream" },
      body,
    });
  });
  await page.route("**/api/chat", async (route) => {
    if (chatDelayMs > 0) await new Promise((r) => setTimeout(r, chatDelayMs));
    await route.fulfill({
      status: 200,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        gameAnalysis: {
          analysis: FOLLOWUP,
          position: "",
          anchor: { ply: 15, moveNumber: 8, color: "w", san: "Nc7+" },
          intent: { intent: "what_if", rule: "what_if:asked_san" },
          followUpPrompt: "1.3",
          validationScore: 1,
          cached: false,
          fastPath: true,
        },
      }),
    });
  });
}

/**
 * Start the page's own clock for a what-if: the time now, and from here on
 * a record of the main thread's long tasks (the renders and the engine's
 * message handling that keep it busy), read back by whatIfTiming.
 */
async function startClock(page: Page): Promise<number> {
  return page.evaluate(() => {
    const w = window as unknown as {
      __longTasks?: Array<{ start: number; duration: number }>;
    };
    w.__longTasks = [];
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries())
          w.__longTasks!.push({ start: e.startTime, duration: e.duration });
      }).observe({ type: "longtask", buffered: false });
    } catch {
      /* no long-task entries here */
    }
    return performance.now();
  });
}

/**
 * How long the what-if took, on the page's own clock: from `t0` (taken just
 * before the Enter) to the question's `asked` mark (the input's latency),
 * the engine's first partial deep enough, the line's paint (`drawn`, the
 * start of the frame after the one that paints it) and the board's move. That is the budget the
 * pathway sets. The harness's own wait for the line to be visible is
 * reported beside it and is not the budget: on the throttled leg
 * Playwright's polling waits for a main thread the page is using.
 */
async function whatIfTiming(
  page: Page,
  t0: number,
  line: Locator,
  sentAt: number
) {
  await expect(line).toBeVisible({ timeout: 10_000 });
  const seenMs = Date.now() - sentAt;
  const r = await page.evaluate((t0) => {
    const at = (name: string) =>
      performance
        .getEntriesByName(name)
        .map((e) => e.startTime)
        .filter((t) => t >= t0);
    const w = window as unknown as {
      __longTasks?: Array<{ start: number; duration: number }>;
    };
    return {
      asked: at("coach-what-if:asked")[0],
      partial: at("coach-what-if:partial")[0],
      drawn: at("coach-what-if:drawn")[0],
      board: at("coach-what-if:board")[0],
      tasks: (w.__longTasks ?? [])
        .filter((t) => t.start >= t0)
        .map((t) => ({
          start: Math.round(t.start - t0),
          duration: Math.round(t.duration),
        })),
    };
  }, t0);
  const ms = (t?: number) => (t === undefined ? "?" : Math.round(t - t0));
  const busy = r.tasks.reduce((sum, t) => sum + t.duration, 0);
  const top = r.tasks
    .slice()
    .sort((a, b) => b.duration - a.duration)
    .slice(0, 6)
    .map((t) => `${t.duration}ms@${t.start}`)
    .join(" ");
  return {
    drawnMs: r.drawn === undefined ? Infinity : r.drawn - t0,
    seenMs,
    summary: `asked ${ms(r.asked)} ms, first partial ${ms(r.partial)} ms, drawn ${ms(r.drawn)} ms, board ${ms(r.board)} ms; seen by the harness ${seenMs} ms; main thread busy ${busy} ms in ${r.tasks.length} long tasks (longest ${top})`,
  };
}

/** The board's box in the document, to the pixel (see board-rectangle.spec.ts). */
async function boardRect(page: Page) {
  const box = await page
    .locator(".cg-wrap")
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return {
        x: r.left + window.scrollX,
        y: r.top + window.scrollY,
        width: r.width,
        height: r.height,
      };
    });
  expect(box.width, "the board is on the page").toBeGreaterThan(0);
  return box;
}

function expectSameRect(
  before: { x: number; y: number; width: number; height: number },
  after: { x: number; y: number; width: number; height: number },
  when: string
) {
  for (const key of ["x", "y", "width", "height"] as const) {
    expect(
      Math.abs(after[key] - before[key]),
      `${when}: board ${key}`
    ).toBeLessThanOrEqual(1);
  }
}

test.describe("the client what-if", () => {
  test("draws the asked move and its refutation under the question within two seconds, and the coach's words leave it on the board", async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    await stubCoach(page);
    await page.goto(`/analysis?pgn=${encodeURIComponent(PGN)}`);

    // The composer unlocks once Stockfish has swept the game.
    const composer = page.getByPlaceholder(
      "Ask anything about this position..."
    );
    const ready = await composer
      .waitFor({ state: "visible", timeout: 180_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(
      !ready,
      "Stockfish never finished on this machine — the what-if is unit-tested"
    );

    // The review first, so the follow-up goes the fast path like a real one.
    await composer.fill("analyse this game");
    await composer.press("Enter");
    await expect(page.getByText("the free queen was bigger")).toBeVisible({
      timeout: 30_000,
    });

    if (testInfo.project.name.includes("mobile")) {
      await throttleLikeAPhone(page);
    }
    const rest = await boardRect(page);

    await composer.fill("what about 8. Qxc1 instead?");
    const t0 = await startClock(page);
    const sentAt = Date.now();
    await composer.press("Enter");

    // The space under the question is there at once, before any answer.
    const whatIf = page.getByTestId("what-if").last();
    await expect(whatIf).toBeVisible({ timeout: 5_000 });
    await expect(whatIf).toHaveAttribute("data-status", /checking|drawn|final/);
    // Where the block sits in the transcript's own column, which does not
    // change when the transcript scrolls to the newest message.
    const placeOf = () =>
      whatIf.evaluate((el) => ({
        top: (el as HTMLElement).offsetTop,
        height: (el as HTMLElement).offsetHeight,
        status: el.getAttribute("data-status"),
      }));
    // Taken while the engine is still checking, so the comparison below is
    // the placeholder against the drawn line; on a fast machine the first
    // partial can land before this read, and then the check is not made.
    const reserved = await placeOf();
    const reservationSeen = reserved.status === "checking";
    if (!reservationSeen)
      testInfo.annotations.push({
        type: "reservation",
        description: `the block was already ${reserved.status} when its reserved place was read`,
      });

    // The exit criterion: the line within two seconds of the send, at a
    // stable depth, on the page's own clock.
    const line = whatIf.getByTestId("what-if-line");
    const timing = await whatIfTiming(page, t0, line, sentAt);
    testInfo.annotations.push({
      type: "what-if first line",
      description: timing.summary,
    });
    console.log(`[what-if] ${testInfo.project.name}: ${timing.summary}`);
    expect(timing.drawnMs).toBeLessThanOrEqual(2_000);
    const depth = Number(await whatIf.getAttribute("data-depth"));
    expect(depth).toBeGreaterThanOrEqual(10);

    // The asked move first, then the engine's reply; the asked move's
    // number beside the played move's, both from that one search.
    await expect(line.getByTestId("what-if-line-ply").first()).toContainText(
      "8.Qxc1"
    );
    expect(await line.getByTestId("what-if-line-ply").count()).toBeGreaterThan(
      1
    );
    const summary = whatIf.getByTestId("what-if-summary");
    await expect(summary).toContainText("8. Qxc1");
    await expect(summary).toContainText(/8\. Qxc1 [+-]\d+\.\d\d/);
    await expect(summary).toContainText(/played 8\. Nc7\+ [+-]\d+\.\d\d/);
    // The depth in the words is the depth on the block, read together (the
    // search deepens between two reads).
    const together = await whatIf.evaluate((el) => ({
      depth: el.getAttribute("data-depth"),
      text: el.querySelector('[data-testid="what-if-summary"]')?.textContent,
    }));
    expect(together.text).toContain(`d${together.depth}`);
    // A what-if is one quiet line: no chip, no badge, no box.
    await expect(line.getByTestId("what-if-line-eval")).toHaveCount(0);

    // The board answered: the asked move is on it, the strip's first row
    // says so, and the board's box did not move.
    await expect(page.getByTestId("exploration-path")).toContainText("Qxc1", {
      timeout: 5_000,
    });
    expectSameRect(rest, await boardRect(page), "the what-if");
    // The reserved space is the space the line took: same place, same height.
    const drawn = await placeOf();
    console.log(
      `[what-if] ${testInfo.project.name}: block ${reserved.height} px while ${reserved.status}, ${drawn.height} px drawn`
    );
    if (reservationSeen) {
      expect(Math.abs(drawn.height - reserved.height)).toBeLessThanOrEqual(2);
      expect(Math.abs(drawn.top - reserved.top)).toBeLessThanOrEqual(2);
    }

    // The coach's words arrive, anchored on the game's move there; the
    // alternative stays on the board and no jump is offered for it.
    await expect(page.getByText("simply takes the queen")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("exploration-path")).toContainText("Qxc1");
    await expect(page.getByTestId("coach-jump-banner")).toHaveCount(0);
    expectSameRect(rest, await boardRect(page), "the coach's words");

    // It deepens under the reader to the final depth, in place.
    await expect(whatIf).toHaveAttribute("data-status", "final", {
      timeout: 90_000,
    });
    expect(
      Number(await whatIf.getAttribute("data-depth"))
    ).toBeGreaterThanOrEqual(depth);
    await expect(summary).toContainText(/8\. Qxc1 [+-]\d+\.\d\d/);
    const finalPlace = await placeOf();
    expect(Math.abs(finalPlace.height - drawn.height)).toBeLessThanOrEqual(2);
    expect(Math.abs(finalPlace.top - drawn.top)).toBeLessThanOrEqual(2);
    expectSameRect(rest, await boardRect(page), "the final depth");

    // A later question about the move the game played there is not the
    // what-if's reply: its anchor moves the board to 8. Nc7+ as it always
    // did, replacing the alternative, with the way back in the strip.
    await composer.fill("why was 8. Nc7+ a mistake?");
    await composer.press("Enter");
    const jump = page.getByTestId("coach-jump-banner");
    await expect(jump).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId("exploration-path")).toHaveCount(0);
    expectSameRect(rest, await boardRect(page), "the later question's jump");
    await jump.getByRole("button", { name: /Back to/ }).click();
    await expect(jump).toHaveCount(0);
    expectSameRect(rest, await boardRect(page), "the way back");
  });

  test("a question that names no legal alternative draws nothing and the coach answers as before", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await stubCoach(page);
    await page.goto(`/analysis?pgn=${encodeURIComponent(PGN)}`);
    const composer = page.getByPlaceholder(
      "Ask anything about this position..."
    );
    const ready = await composer
      .waitFor({ state: "visible", timeout: 180_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!ready, "Stockfish never finished on this machine");
    await composer.fill("analyse this game");
    await composer.press("Enter");
    await expect(page.getByText("the free queen was bigger")).toBeVisible({
      timeout: 30_000,
    });

    // Qxf7+ is not a move White has at move 8: nothing to draw.
    await composer.fill("what about 8. Qxf7+ instead?");
    await composer.press("Enter");
    await expect(page.getByText("simply takes the queen")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("what-if")).toHaveCount(0);
    // The coach's anchor moves the board, as it always did.
    await expect(page.getByTestId("coach-jump-banner")).toBeVisible();
  });
  test("asked while the live eval is searching, the what-if takes the engine and still draws within two seconds", async ({
    page,
  }, testInfo) => {
    test.setTimeout(240_000);
    // The coach answers at once, so its words and anchor come before the
    // engine's first deep partial: the anchor's jump must wait for the line.
    await stubCoach(page, { chatDelayMs: 0 });
    await page.goto(`/analysis?pgn=${encodeURIComponent(PGN)}`);
    const composer = page.getByPlaceholder(
      "Ask anything about this position..."
    );
    const ready = await composer
      .waitFor({ state: "visible", timeout: 180_000 })
      .then(() => true)
      .catch(() => false);
    test.skip(!ready, "Stockfish never finished on this machine");
    await composer.fill("analyse this game");
    await composer.press("Enter");
    await expect(page.getByText("the free queen was bigger")).toBeVisible({
      timeout: 30_000,
    });
    if (testInfo.project.name.includes("mobile")) {
      await throttleLikeAPhone(page);
    }

    // Move the board one ply: the live eval starts a fresh search for the
    // new position (the arrow keys are ignored while the composer has the
    // focus, so it gives it up first). Then ask at once, while that search
    // is in flight: the what-if aborts it in whatever phase it is and goes
    // ahead of any live eval still waiting.
    await composer.blur();
    await page.keyboard.press("ArrowRight");
    await composer.fill("what about 8. Qxc1 instead?");
    const t0 = await startClock(page);
    const sentAt = Date.now();
    await composer.press("Enter");

    const whatIf = page.getByTestId("what-if").last();
    const line = whatIf.getByTestId("what-if-line");
    const timing = await whatIfTiming(page, t0, line, sentAt);
    testInfo.annotations.push({
      type: "what-if first line (live eval in flight)",
      description: timing.summary,
    });
    console.log(
      `[what-if] ${testInfo.project.name}: with the live eval in flight, ${timing.summary}`
    );
    expect(timing.drawnMs).toBeLessThanOrEqual(2_000);
    expect(
      Number(await whatIf.getAttribute("data-depth"))
    ).toBeGreaterThanOrEqual(10);
    await expect(whatIf.getByTestId("what-if-summary")).toContainText(
      /8\. Qxc1 [+-]\d+\.\d\d · played 8\. Nc7\+ [+-]\d+\.\d\d/
    );
    // The board answered from the ply the reader was on, although the
    // coach's words (anchored on 8. Nc7+) were in first: their jump waited
    // for the line and was dropped when it came.
    await expect(page.getByText("simply takes the queen")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("exploration-path")).toContainText("Qxc1", {
      timeout: 5_000,
    });
    await expect(page.getByTestId("coach-jump-banner")).toHaveCount(0);
    // And the search runs on to its final depth: the aborted live eval did
    // not take the engine back.
    await expect(whatIf).toHaveAttribute("data-status", "final", {
      timeout: 90_000,
    });
    await expect(page.getByTestId("coach-jump-banner")).toHaveCount(0);

    // The strip's way back leaves the alternative and returns to the move
    // (the button wears its tooltip as its accessible name).
    await page.getByRole("button", { name: /Leave this line/ }).click();
    await expect(page.getByTestId("exploration-path")).toHaveCount(0);
  });
});
