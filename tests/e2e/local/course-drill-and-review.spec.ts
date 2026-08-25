import { test, expect, type Page } from "@playwright/test";

/**
 * Drill, the hint ladder and the round summary.
 *
 * The measurement that proves the whole thing is in here: with every decision
 * seeded as KNOWN, a session has nothing to ask and a drill asks anyway. If
 * that ever stops being true, "drill it cold" has quietly become "drill the
 * parts you are bad at", which is the session the player already has.
 */

const ACCOUNT = "e2e";

/**
 * A signed-in account, for the paths that key storage by uid.
 *
 * `onboardingCompletedAt` is load-bearing and was learned the hard way here:
 * without it OnboardingNudge opens a MUI Modal over the page, and a modal's
 * backdrop swallows every click. The failure reads as "the hint button does
 * nothing" on a screenshot that looks perfectly fine.
 */
async function stubAccount(page: Page) {
  await page.route("**/api/auth/me", (route) =>
    route.fulfill({
      json: {
        user: {
          uid: ACCOUNT,
          email: "e2e@example.com",
          handle: "e2e",
          displayName: "E2E",
          onboardingCompletedAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
        },
        isIntern: false,
        isAdmin: false,
      },
    })
  );
  await page.addInitScript(`window.ACCOUNT = ${JSON.stringify(ACCOUNT)};`);
  await page.addInitScript(`try { localStorage.setItem("cm_onboarding_nudge_dismissed", "1"); } catch {}`);
}

async function dismissChrome(page: Page) {
  await page
    .getByRole("button", { name: "I agree" })
    .click({ timeout: 10_000 })
    .catch(() => {});
}

async function play(page: Page, from: string, to: string) {
  await page.locator(`[data-square="${from}"]`).first().click();
  await page.locator(`[data-square="${to}"]`).first().click();
  await page.waitForTimeout(260);
}

/** Seed every decision in the chapter as answered cold. Returns how many. */
async function seedAllKnown(page: Page): Promise<number> {
  return page.evaluate(() => {
    const data = JSON.parse(document.getElementById("__NEXT_DATA__")!.textContent!);
    const probes = data.props.pageProps.probes as Array<{ key: string }>;
    const records: Record<string, unknown> = {};
    for (const probe of probes) {
      records[probe.key] = {
        key: probe.key,
        correctness: 2,
        asks: 1,
        misses: 0,
        hinted: false,
        lastRound: 1,
        at: 1,
      };
    }
    localStorage.setItem(
      `cm.course.v1.chapter:${(window as unknown as { ACCOUNT: string }).ACCOUNT}:w-london:0`,
      JSON.stringify({ v: 1, courseId: "w-london", chapter: 0, records, updatedAt: 1 })
    );
    return probes.length;
  });
}

test.describe("drill", () => {
  test("lists every chapter and study, with what a drill of it will ask", async ({ page }) => {
    await page.goto("/train/course/w-london/drill");
    await dismissChrome(page);
    await expect(page.getByRole("heading", { name: "Drill" })).toBeVisible();
    const first = page.getByTestId("drill-chapter-0");
    await expect(first).toContainText(/\d+ decisions · \d+ rounds of 5/);
    await expect(page.getByTestId("drill-go-0-d5")).toBeVisible();
  });

  test("asks a player who knows everything — the whole point of the mode", async ({ page }) => {
    await stubAccount(page);
    await page.goto("/train/course/w-london/0");
    await dismissChrome(page);
    const seeded = await seedAllKnown(page);
    expect(seeded).toBeGreaterThan(0);

    // The control first: a session has nothing left to ask.
    await page.goto("/train/course/w-london/0?round=1");
    await expect(page.getByTestId("round-summary")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Your move")).toHaveCount(0);

    // The drill asks anyway.
    await page.goto("/train/course/w-london/0?drill=1&round=1");
    await expect(page.getByText("Your move")).toBeVisible({ timeout: 10_000 });
  });

  test("stays a drill through its rounds and its exit", async ({ page }) => {
    await page.goto("/train/course/w-london/0?drill=1");
    await dismissChrome(page);
    await expect(page.getByTestId("course-headline")).toHaveText("Everything, asked cold.");
    await expect(page.getByTestId("drill-scope")).toBeVisible();
    // Losing the flag on the next round would silently turn a drill into a
    // session: same board, same grading, a different queue, nothing said.
    await expect(page.getByTestId("course-start")).toHaveAttribute("href", /drill=1.*round=1/);
  });

  test("a study drill is scoped to the study", async ({ page }) => {
    await page.goto("/train/course/w-london/0?drill=1&study=d5");
    await dismissChrome(page);
    await expect(page.getByTestId("drill-scope")).toContainText("Black plays 2...d5");

    const scoped = await page.evaluate(() => {
      const data = JSON.parse(document.getElementById("__NEXT_DATA__")!.textContent!);
      return data.props.pageProps.probes.length as number;
    });
    await page.goto("/train/course/w-london/0?drill=1");
    const whole = await page.evaluate(() => {
      const data = JSON.parse(document.getElementById("__NEXT_DATA__")!.textContent!);
      return data.props.pageProps.probes.length as number;
    });
    expect(scoped).toBeGreaterThan(0);
    expect(scoped).toBeLessThan(whole);
  });
});

test.describe("the hint", () => {
  test("narrows a rung at a time, and never produces KNOWN", async ({ page }) => {
    await stubAccount(page);
    await page.goto("/train/course/w-london/0?round=1");
    await dismissChrome(page);
    await expect(page.getByText("Your move")).toBeVisible({ timeout: 10_000 });

    // The cost is stated BEFORE it is paid. A cost you learn about afterwards
    // is a trick.
    const button = page.getByTestId("hint-button");
    await expect(button).toContainText("will not count as known");

    await button.click();
    await expect(page.getByTestId("hint-text")).toBeVisible();
    const first = await page.getByTestId("hint-text").innerText();
    expect(first).toMatch(/^A \w+ (moves|takes something)\.$|^The king moves to safety\.$/);

    await button.click();
    const second = await page.getByTestId("hint-text").innerText();
    expect(second).not.toBe(first);

    // Now play the course move. It is right, and it still is not knowledge.
    const answer = await page.evaluate(() => {
      const data = JSON.parse(document.getElementById("__NEXT_DATA__")!.textContent!);
      const probes = data.props.pageProps.probes as Array<{ key: string; san: string }>;
      return probes[0];
    });
    const squares = second.match(/([a-h][1-8]) to ([a-h][1-8])/);
    if (squares) {
      await play(page, squares[1], squares[2]);
      const stored = await page.evaluate(
        ([account, key]) => {
          const raw = localStorage.getItem(`cm.course.v1.chapter:${account}:w-london:0`);
          if (!raw) return null;
          return JSON.parse(raw).records[key as string] ?? null;
        },
        [ACCOUNT, answer.key]
      );
      // THE GUARANTEE: right after a hint is -1, never 2. `known` can never
      // come to mean `was shown`.
      expect(stored).not.toBeNull();
      expect(stored.correctness).toBe(-1);
      expect(stored.hinted).toBe(true);
      // And it earned a card, because it was not recalled.
      expect(typeof stored.dueAt).toBe("number");
    }
  });
});

test.describe("the round summary", () => {
  test("leads with the chapter shrinking, not with the round's score", async ({ page }) => {
    await stubAccount(page);
    await page.goto("/train/course/w-london/0?round=1");
    await dismissChrome(page);
    await expect(page.getByText("Your move")).toBeVisible({ timeout: 10_000 });

    // A round of five, every answer wrong: each miss re-queues once, so the
    // timeline grows to ten and the round ends on `at >= timeline.length` after
    // ten answers. Each answer costs two turns of this loop — the move, then
    // the teach card's Continue — so twelve was not nearly enough and the
    // failure read as "the summary never renders".
    for (let i = 0; i < 40; i++) {
      if (await page.getByTestId("round-summary").isVisible()) break;
      if (await page.getByTestId("teach-continue").isVisible()) {
        await page.getByTestId("teach-continue").click();
        continue;
      }
      await play(page, "a2", "a3");
    }

    const summary = page.getByTestId("round-summary");
    await expect(summary).toBeVisible({ timeout: 15_000 });
    // The number that only falls leads; the round's own score is underneath.
    await expect(page.getByTestId("summary-open")).toBeVisible();
    await expect(page.getByTestId("summary-wrong")).not.toHaveText("0");
    // Missing things earns reviews.
    await expect(page.getByTestId("summary-due")).toBeVisible();
    await expect(page.getByTestId("summary-exit")).toBeVisible();
  });
});
