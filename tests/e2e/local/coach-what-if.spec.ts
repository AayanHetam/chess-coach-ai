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
 * engine is seen to answer first. At 0 the words come at once, and which
 * lands first is a race unless the engine is held (holdableEngine).
 */
/**
 * Was this build made with typed page orders on (pageActions.ts)? The CI
 * legs are; the steps that type an order run only then.
 */
async function pageActionsOn(page: Page): Promise<boolean> {
  return (
    (await page
      .locator("[data-page-actions]")
      .first()
      .getAttribute("data-page-actions")) === "on"
  );
}

async function stubCoach(
  page: Page,
  {
    chatDelayMs = 1500,
    chatBodies,
  }: { chatDelayMs?: number; chatBodies?: unknown[] } = {}
) {
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
    chatBodies?.push(route.request().postDataJSON());
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
 * The engine's messages can be held: an init script wraps the page's Worker
 * so that, between `hold` and `release`, every message a worker posts back
 * waits, in order, and is delivered at the release. With the engine held
 * from the send, the coach's words (stubbed to answer at once) are on the
 * page before the what-if's search has said a word: the order the jump's
 * hold is for, made certain instead of raced.
 */
async function holdableEngine(page: Page) {
  await page.addInitScript(() => {
    const Native = window.Worker;
    const queue: Array<() => void> = [];
    const state: { on: boolean; until: string | null } = {
      on: false,
      until: null,
    };
    const release = () => {
      state.on = false;
      state.until = null;
      for (const deliver of queue.splice(0)) deliver();
    };
    (window as unknown as { __engineHold: unknown }).__engineHold = {
      // Hold until release(), or until the page sets the mark `until`:
      // released from the page itself, a task later, so the harness adds
      // no round trip to what it measures.
      hold: (until?: string) => {
        state.on = true;
        state.until = until ?? null;
      },
      release,
    };
    const mark = performance.mark.bind(performance);
    performance.mark = ((name: string, options?: PerformanceMarkOptions) => {
      const entry = mark(name, options);
      if (state.on && state.until === name) setTimeout(release, 0);
      return entry;
    }) as typeof performance.mark;
    class HeldWorker extends Native {
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        // The page's `onmessage` lands on this accessor, never on the
        // worker's own; the worker's messages reach it through a listener.
        let handler: ((e: MessageEvent) => unknown) | null = null;
        Object.defineProperty(this, "onmessage", {
          configurable: true,
          get: () => handler,
          set: (h: ((e: MessageEvent) => unknown) | null) => {
            handler = h;
          },
        });
        this.addEventListener("message", (event: MessageEvent) => {
          const h = handler;
          if (!h) return;
          if (state.on) queue.push(() => h.call(this, event));
          else h.call(this, event);
        });
      }
    }
    window.Worker = HeldWorker as typeof Worker;
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

/**
 * Record the what-if block's height and place at every status it takes,
 * inside the page, at the moment the status changes (a MutationObserver's
 * callback runs before the next paint, and reading offsetHeight there lays
 * out the state just committed). Read back with recordedPlaces.
 */
async function recordWhatIfPlaces(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as {
      __whatIfPlaces?: Array<{
        status: string | null;
        height: number;
        top: number;
      }>;
    };
    w.__whatIfPlaces = [];
    const record = (el: HTMLElement) =>
      w.__whatIfPlaces!.push({
        status: el.getAttribute("data-status"),
        height: el.offsetHeight,
        top: el.offsetTop,
      });
    const isBlock = (n: Node): boolean =>
      n instanceof HTMLElement && n.getAttribute("data-testid") === "what-if";
    new MutationObserver((records) => {
      for (const r of records) {
        if (r.type === "attributes" && isBlock(r.target))
          record(r.target as HTMLElement);
        if (r.type === "childList")
          for (const n of Array.from(r.addedNodes)) {
            if (!(n instanceof HTMLElement)) continue;
            const el = isBlock(n)
              ? n
              : (n.querySelector(
                  '[data-testid="what-if"]'
                ) as HTMLElement | null);
            if (el) record(el);
          }
      }
    }).observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["data-status"],
    });
  });
}

async function recordedPlaces(page: Page) {
  return page.evaluate(
    () =>
      (
        window as unknown as {
          __whatIfPlaces?: Array<{
            status: string | null;
            height: number;
            top: number;
          }>;
        }
      ).__whatIfPlaces ?? []
  );
}

/** The marks of a name the page set after `t0`. */
async function marksAfter(page: Page, name: string, t0: number) {
  return page.evaluate(
    ({ name, t0 }) =>
      performance
        .getEntriesByName(name)
        .map((e) => e.startTime)
        .filter((t) => t >= t0),
    { name, t0 }
  );
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
    const chatBodies: unknown[] = [];
    await stubCoach(page, { chatBodies });
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
    await recordWhatIfPlaces(page);
    const t0 = await startClock(page);
    const sentAt = Date.now();
    await composer.press("Enter");

    // The space under the question is there at once, before any answer.
    const whatIf = page.getByTestId("what-if").last();
    await expect(whatIf).toBeVisible({ timeout: 5_000 });
    await expect(whatIf).toHaveAttribute("data-status", /checking|drawn|final/);

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
    await expect(summary).toContainText(/played Nc7\+ [+-]\d+\.\d\d/);
    // The depth in the words is the depth on the block, read together (the
    // search deepens between two reads).
    const together = await whatIf.evaluate((el) => ({
      depth: el.getAttribute("data-depth"),
      text: el.querySelector('[data-testid="what-if-summary"]')?.textContent,
    }));
    expect(together.text).toContain(`d${together.depth}`);
    // A what-if is one quiet line: no chip, no badge, no box. Neither the
    // block nor its line draws a border, a background or a shadow.
    const chrome = await whatIf.evaluate((el) =>
      [el, el.querySelector('[data-testid="what-if-line"]')]
        .filter((n): n is Element => n !== null)
        .map((n) => {
          const cs = getComputedStyle(n);
          return {
            border: [
              cs.borderTopWidth,
              cs.borderRightWidth,
              cs.borderBottomWidth,
              cs.borderLeftWidth,
            ].join(" "),
            background: cs.backgroundColor,
            image: cs.backgroundImage,
            shadow: cs.boxShadow,
          };
        })
    );
    expect(chrome).toHaveLength(2);
    for (const c of chrome) {
      expect(c.border).toBe("0px 0px 0px 0px");
      expect(c.background).toMatch(/^(rgba\(0, 0, 0, 0\)|transparent)$/);
      expect(c.image).toBe("none");
      expect(c.shadow).toBe("none");
    }

    // The board answered: the asked move is on it, the strip's first row
    // says so, and the board's box did not move.
    await expect(page.getByTestId("exploration-path")).toContainText("Qxc1", {
      timeout: 5_000,
    });
    expectSameRect(rest, await boardRect(page), "the what-if");

    // The reader walks the line while it deepens: its moves stay the ones
    // tapped (a deeper search may change the engine's reply, and a swap
    // under the reader would name a move that is not on the board).
    const plies = line.getByTestId("what-if-line-ply");
    const walked = await plies.allTextContents();
    const sanOf = (ply: string) => ply.replace(/^\d+\.+\s*/, "");
    await plies.nth(1).click();
    await expect(page.getByTestId("exploration-path")).toContainText(
      sanOf(walked[1]),
      { timeout: 5_000 }
    );
    await expect(whatIf).toHaveAttribute("data-pinned", "true");

    // The coach's words arrive, anchored on the game's move there; the
    // alternative stays on the board and no jump is offered for it.
    await expect(page.getByText("simply takes the queen")).toBeVisible({
      timeout: 30_000,
    });
    // The question went up with the search's numbers: the asked move and
    // the move played, from the position before 8. Nc7+, at the stable
    // depth (the route verifies them; lib/coach/clientEvals.ts).
    const asked = chatBodies[chatBodies.length - 1] as {
      userMessage: string;
      clientEvals?: {
        index: number;
        fen: string;
        depth: number;
        moves: Array<{ role: string; uci: string; cp?: number; mate?: number }>;
      };
    };
    expect(asked.userMessage).toBe("what about 8. Qxc1 instead?");
    expect(asked.clientEvals).toBeDefined();
    expect(asked.clientEvals!.index).toBe(14);
    expect(asked.clientEvals!.fen).toBe(
      "r1b1kbnr/pp1ppppp/2n5/1N6/4P3/5N2/P1P2PPP/2qQKB1R w Kkq - 0 8"
    );
    expect(asked.clientEvals!.depth).toBeGreaterThanOrEqual(10);
    expect(asked.clientEvals!.moves.map((m) => [m.role, m.uci])).toEqual(
      expect.arrayContaining([
        ["asked", "d1c1"],
        ["played", "b5c7"],
      ])
    );
    for (const m of asked.clientEvals!.moves)
      expect(m.cp !== undefined || m.mate !== undefined, m.uci).toBe(true);
    const sent = await marksAfter(page, "coach-what-if:sent", t0);
    expect(sent).toHaveLength(1);
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
    expect(await plies.allTextContents()).toEqual(walked);
    expectSameRect(rest, await boardRect(page), "the final depth");

    // Played to its end and then again from the start, after the final
    // depth: the moves are still the ones walked (the replay's first step
    // clears the board back to the asked position, which must not let the
    // deeper line in), and Play runs to the last of them.
    const play = line.getByTestId("what-if-line-play");
    const lastSan = sanOf(walked[walked.length - 1]);
    for (const round of ["on to the end", "again from the start"]) {
      await play.click();
      await expect(play, round).toHaveText(/Play/, { timeout: 20_000 });
      await expect(page.getByTestId("exploration-path"), round).toContainText(
        lastSan
      );
      expect(await plies.allTextContents(), round).toEqual(walked);
    }

    // The block held one height and one place from the send to the final
    // depth, read in the page at each status as it was committed.
    const places = await recordedPlaces(page);
    console.log(
      `[what-if] ${testInfo.project.name}: ${places
        .map((p) => `${p.status} ${p.height}px@${p.top}`)
        .join(", ")}`
    );
    expect(places.map((p) => p.status)).toEqual(
      expect.arrayContaining(["checking", "drawn", "final"])
    );
    expect(places[0].status).toBe("checking");
    for (const p of places) {
      expect(
        Math.abs(p.height - places[0].height),
        p.status!
      ).toBeLessThanOrEqual(1);
      expect(Math.abs(p.top - places[0].top), p.status!).toBeLessThanOrEqual(1);
    }

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

    // Typed (behind its flag): the line the reader played, played again
    // through its own Play, so its highlight follows the board to the end.
    if (await pageActionsOn(page)) {
      await composer.fill("play the line again");
      await composer.press("Enter");
      await expect(
        page.getByText(/^Playing the line from \W*8\. Qxc1\.$/)
      ).toBeVisible();
      await expect(page.getByTestId("exploration-path")).toContainText(
        lastSan,
        { timeout: 20_000 }
      );
      await expect(plies.last()).toHaveAttribute("aria-pressed", "true");
      expect(await plies.allTextContents()).toEqual(walked);
    }
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
    // The coach's words come well after the two-second budget, so the line
    // is drawn first and the anchor's jump for the words is dropped (the
    // other order has its own test, below).
    await holdableEngine(page);
    await stubCoach(page, { chatDelayMs: 4_000 });
    // The live eval runs on the engine, not the cloud's head start.
    await page.route("**/lichess.org/api/cloud-eval**", (r) => r.abort());
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
    // focus, so the question is typed first and the focus given up). The
    // engine's replies are held from the moment that search starts, so it
    // is certainly still searching when the question is sent: the what-if
    // must abort it, in whatever phase it is, to take the engine. Held, the
    // search could not finish on a fast machine before the Enter.
    const searches = () =>
      page.evaluate(
        () => performance.getEntriesByName("coach-live-eval:search").length
      );
    const searchesBefore = await searches();
    await composer.fill("what about 8. Qxc1 instead?");
    await composer.blur();
    await page.keyboard.press("ArrowRight");
    await page.waitForFunction(
      (n) => performance.getEntriesByName("coach-live-eval:search").length > n,
      searchesBefore,
      { polling: "raf", timeout: 10_000 }
    );
    // Held until the what-if stops the live search: the page releases the
    // engine itself the moment it marks that.
    await page.evaluate(() =>
      (
        window as unknown as {
          __engineHold: { hold: (until?: string) => void };
        }
      ).__engineHold.hold("coach-what-if:preempted")
    );
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
      /8\. Qxc1 [+-]\d+\.\d\d · played Nc7\+ [+-]\d+\.\d\d/
    );
    // The board answered from the ply the reader was on, and the coach's
    // words (anchored on 8. Nc7+) arrive after the line: their jump is
    // dropped for it, never held.
    await expect(page.getByTestId("exploration-path")).toContainText("Qxc1", {
      timeout: 5_000,
    });
    await expect(page.getByText("simply takes the queen")).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("coach-jump-banner")).toHaveCount(0);
    expect(
      await marksAfter(page, "coach-what-if:jump-skipped", t0)
    ).toHaveLength(1);
    expect(await marksAfter(page, "coach-what-if:jump-held", t0)).toHaveLength(
      0
    );
    // The what-if stopped the live search while it was still running to
    // take the engine: the live search ended on its abort, after the ask.
    expect(await marksAfter(page, "coach-what-if:preempted", t0)).toHaveLength(
      1
    );
    expect(
      (await marksAfter(page, "coach-live-eval:aborted", t0)).length
    ).toBeGreaterThanOrEqual(1);
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

  test("when the coach's words come first, their jump waits for the line and is dropped when it is drawn", async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await holdableEngine(page);
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

    // The engine is held from the send: the what-if is still checking
    // when the coach's words and their anchor (8. Nc7+) arrive.
    await composer.fill("what about 8. Qxc1 instead?");
    const t0 = await startClock(page);
    await page.evaluate(() =>
      (
        window as unknown as { __engineHold: { hold: () => void } }
      ).__engineHold.hold()
    );
    await composer.press("Enter");
    const whatIf = page.getByTestId("what-if").last();
    await expect(page.getByText("simply takes the queen")).toBeVisible({
      timeout: 30_000,
    });
    await expect
      .poll(
        async () =>
          (await marksAfter(page, "coach-what-if:jump-held", t0)).length,
        { timeout: 5_000 }
      )
      .toBe(1);
    // The jump waits: no banner, the board where the reader left it.
    await expect(whatIf).toHaveAttribute("data-status", "checking");
    await expect(page.getByTestId("coach-jump-banner")).toHaveCount(0);
    await expect(page.getByTestId("exploration-path")).toHaveCount(0);

    // The engine answers: the line is drawn, the alternative goes on the
    // board, and the held jump is dropped for it.
    await page.evaluate(() =>
      (
        window as unknown as { __engineHold: { release: () => void } }
      ).__engineHold.release()
    );
    await expect(whatIf.getByTestId("what-if-line")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId("exploration-path")).toContainText("Qxc1", {
      timeout: 5_000,
    });
    await expect(page.getByTestId("coach-jump-banner")).toHaveCount(0);
    expect(await marksAfter(page, "coach-what-if:jump-held", t0)).toHaveLength(
      1
    );
    expect(
      await marksAfter(page, "coach-what-if:jump-skipped", t0)
    ).toHaveLength(0);

    // Typed (behind its flag): "back" leaves the line the what-if put on
    // the board, and "play the line again" plays the line under the
    // question, read from its store and held there from then on.
    if (await pageActionsOn(page)) {
      await composer.fill("back");
      await composer.press("Enter");
      await expect(page.getByTestId("exploration-path")).toHaveCount(0);
      await composer.fill("play the line again");
      await composer.press("Enter");
      await expect(
        page.getByText(/^Playing the line from \W*8\. Qxc1\.$/)
      ).toBeVisible();
      await expect(whatIf).toHaveAttribute("data-pinned", "true");
      const plies = whatIf.getByTestId("what-if-line-ply");
      const held = await plies.allTextContents();
      const sanOf = (ply: string) => ply.replace(/^\d+\.+\s*/, "");
      await expect(page.getByTestId("exploration-path")).toContainText(
        sanOf(held[held.length - 1]),
        { timeout: 20_000 }
      );
      expect(await plies.allTextContents()).toEqual(held);
    }
  });
});
