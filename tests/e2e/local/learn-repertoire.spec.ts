import { test, expect, type Page } from "@playwright/test";

/**
 * /learn, the repertoire bracket, in a real browser.
 *
 * The bracket maths is unit-tested. What cannot be unit-tested is whether the
 * derived slots, the chooser and the coverage bar agree with each other on
 * screen — and whether a branch that only exists once a choice is made
 * actually appears when it is.
 */

async function stub(page: Page, rating?: number) {
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({
      json: {
        user: {
          uid: "e2e", email: "e2e@example.com", handle: "e2e", displayName: "E2E",
          platformRating: rating, platformRatingSource: rating ? "chesscom" : undefined,
        },
        isIntern: false,
        isAdmin: false,
      },
    })
  );
}

async function throughQuiz(page: Page) {
  await page.goto("/learn");
  // The consent banner is a modal <dialog>, so while it is open the REST of
  // the page is out of the accessibility tree entirely and getByRole finds
  // nothing. It also mounts after navigation resolves, so the usual
  // `isVisible() ? click()` races it: the check runs before it exists, the
  // click is skipped, and every later locator fails for a reason that looks
  // nothing like a consent banner. Wait for it, then tolerate its absence.
  await page
    .getByRole("button", { name: "I agree" })
    .click({ timeout: 10_000 })
    .catch(() => {});
  // And the onboarding nudge is a MODAL <dialog>, which makes the entire rest
  // of the page inert to the accessibility tree. Every getByRole then reports
  // "element(s) not found" for content that is plainly there in the snapshot,
  // which is a fault that looks nothing like its cause.
  await page
    .getByRole("button", { name: /Maybe later/i })
    .click({ timeout: 10_000 })
    .catch(() => {});
  await expect(page.getByRole("heading", { name: /how much theory/i })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: /Whatever it takes/i }).click();
  await expect(page.getByRole("heading", { name: /what kind of game/i })).toBeVisible();
  await page.getByRole("button", { name: /punish mistakes/i }).click();
  await expect(page.getByRole("heading", { name: "Your repertoire" })).toBeVisible({ timeout: 15_000 });
}

test.describe("repertoire bracket", () => {
  test.beforeEach(async ({ page }) => {
    await stub(page);
  });

  test("asks two questions, then shows the bracket", async ({ page }) => {
    const crashes: string[] = [];
    page.on("pageerror", (e) => crashes.push(String(e)));

    await throughQuiz(page);

    // Nothing chosen, so nothing is answered. A repertoire builder that opens
    // at some flattering number would be lying on its first screen. Asserted
    // through the meter's accessible name rather than by matching "0%" as
    // text, because "10%" contains "0%".
    await expect(page.getByRole("img", { name: /^0 percent answered$/ })).toBeVisible();
    await page.getByRole("tab", { name: /As Black/i }).click();
    await expect(page.getByRole("button", { name: /Against the Sicilian/i })).toHaveCount(0);
    // Black's roots are the moves White can open with.
    await expect(page.getByText(/Against 1\.e4/).first()).toBeVisible();
    await expect(page.getByText(/Against 1\.d4/).first()).toBeVisible();

    expect(crashes, `page errors: ${crashes.join("\n")}`).toHaveLength(0);
  });

  test("choosing an opening opens the branches it does not answer", async ({ page }) => {
    await throughQuiz(page);
    await page.getByRole("tab", { name: /As Black/i }).click();

    await page.getByText(/Against 1\.d4/).first().click();
    // The suggestion carries what it costs and what it leaves open.
    const grunfeld = page.getByRole("button", { name: /Grünfeld Defence/i }).first();
    await expect(grunfeld).toBeVisible({ timeout: 10_000 });
    await grunfeld.click();

    // This is the whole point of the page: the Grünfeld answers 1.d4 and
    // nothing else, so the London and the Trompowsky now need their own answer.
    await expect(page.getByText(/Trompowsky/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Accelerated London System/i).first()).toBeVisible();
    // And the coverage number moved off zero.
    await expect(page.getByRole("img", { name: /^0 percent answered$/ })).toHaveCount(0);
  });

  test("the library search is filtered to what is reachable", async ({ page }) => {
    await throughQuiz(page);
    await page.getByRole("tab", { name: /As Black/i }).click();
    await page.getByText(/Against 1\.e4/).first().click();

    const box = page.getByRole("textbox", { name: /Search every named opening/i });
    await expect(box).toBeVisible({ timeout: 10_000 });
    await box.fill("Najdorf");
    await expect(page.getByText(/Najdorf/).first()).toBeVisible({ timeout: 15_000 });

    // A real opening that cannot arise after 1.e4 must not be offered here.
    //
    // Note what this does NOT assert: that searching "Grünfeld" from 1.e4 finds
    // nothing. It finds "Van Geet Opening: Grünfeld Defense", which really is
    // reachable (1.e4 d5 2.Nc3 dxe4 3.Nxe4 e5). The guarantee is about the
    // LINE, not the name — so that is what is checked.
    await box.fill("Grünfeld");
    await expect(page.getByText(/Van Geet/i).first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("1.d4 Nf6 2.c4 g6")).toHaveCount(0);
  });

  test("says what a position becomes, even where no book names it", async ({ page }) => {
    await throughQuiz(page);
    await page.getByRole("tab", { name: /As Black/i }).click();
    // 1.c4 is 6% of Black's games, so it is one of the roots held back until
    // the first three are answered. Open the deferred group to reach it.
    await page.getByRole("button", { name: /more, when you are ready/i }).click();
    await page.getByText(/Against the English/).first().click();

    // 1.c4 has no prose anywhere. What it HAS is a measurable answer: the
    // continuation people actually play, the structure that produces, and the
    // breaks that really occur.
    await expect(page.getByText(/What this becomes/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/games\./).first()).toBeVisible();
    await expect(page.getByText(/Most played, not best/i).first()).toBeVisible();
  });

  test("pitches the same slot differently at 700 and at 1700", async ({ page }) => {
    // The whole point of the level model. A 700 and a 1700 opening the SAME
    // slot must not be handed the same list in the same order.
    await stub(page, 700);
    await throughQuiz(page);
    await page.getByRole("tab", { name: /As Black/i }).click();
    await page.getByText(/Against 1\.d4/).first().click();

    const cards = page.locator('[role="group"] button').filter({ hasText: /answers|more decisions/ });
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    // A beginner is offered a beginner opening first, and told which ones cost.
    await expect(cards.first()).toContainText(/King's Indian/i);
    await expect(page.getByText(/A long way above your level/i).first()).toBeVisible();
    // And the one that suits them says BOTH things: it fits, and it is heavy.
    await expect(cards.first()).toContainText(/suits your level/i);
    await expect(cards.first()).toContainText(/a lot of theory/i);
  });

  test("tells a player when their repertoire is finished", async ({ page }) => {
    await stub(page, 700);
    await throughQuiz(page);
    // Nothing chosen, so it must NOT say they are done.
    await expect(page.getByText(/Not finished yet/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/treating you as starting out/i)).toBeVisible();
    // And it says what opening work is worth at this level, which is: not much.
    await expect(page.getByText(/not spent on tactics/i)).toBeVisible();
  });
});

test.describe("level-aware breadth", () => {
test('asks a beginner for three decisions, and defers the rest without hiding them', async ({ page }) => {
  // The tightest consensus in the coaching literature is about breadth, not
  // depth: one White opening, one answer to 1.e4, one answer to 1.d4. Showing a
  // 700 all five roots is a wall, and hiding two of them is a lie — so they are
  // deferred, named, and one click away.
  await throughQuiz(page);
  await page.getByRole('tab', { name: /As Black/i }).click();

  const deferred = page.getByRole('button', { name: /more, when you are ready/i });
  await expect(deferred).toBeVisible();
  // It says what is being held back and what it is worth, not just that
  // something is.
  await expect(deferred).toContainText(/of games/);

  const before = await page.getByText(/of games · nothing chosen/).count();
  await deferred.click();
  await expect(page.getByRole('button', { name: /Show fewer/i })).toBeVisible();
  expect(await page.getByText(/of games · nothing chosen/).count()).toBeGreaterThan(before);
});

test('shows the position an opening becomes, not just its name', async ({ page }) => {
  // A name is not a picture. The player this page is for does not know what a
  // Grünfeld is, and the board tells them.
  await throughQuiz(page);
  await page.getByRole('tab', { name: /As Black/i }).click();
  await page.getByText(/Against 1\.e4/).first().click();

  const cards = page.locator('button', { hasText: 'Caro-Kann' }).first();
  await expect(cards).toBeVisible();
  // Every suggestion carries a board, and the boards are not all the same one.
  const boards = page.locator('svg[viewBox="0 0 100 100"]');
  expect(await boards.count()).toBeGreaterThan(3);
});

test('says what a choice finishes, in a sentence', async ({ page }) => {
  await throughQuiz(page);
  await page.getByRole('tab', { name: /As Black/i }).click();
  await page.getByText(/Against 1\.e4/).first().click();

  // One that answers more of the slot than another — the distinction a bare
  // percentage does not make.
  //
  // NOT "answers everything after 1.e4" any more, and that is a finding rather
  // than a broken test. The Caro-Kann absorbs 100% of Elite play and 79% of
  // improving play, because weaker White players play things with no name:
  // 2.Bc4 is 6.3% of what an improving Caro player meets and 11.3% of what a
  // sub-800 one does. The old sentence was true at 2300+ and told to everyone.
  await expect(page.getByText(/You still need something for the other/).first()).toBeVisible();
  await expect(page.getByText(/answers \d+% of/).first()).toBeVisible();
});
});

test.describe("style, colour and fit", () => {
  test.beforeEach(async ({ page }) => {
    await stub(page, 1700);
  });

  test("every suggestion says what kind of game it is", async ({ page }) => {
    await throughQuiz(page);
    await page.getByRole("tab", { name: /As Black/i }).click();
    await page.getByText(/Against 1\.d4/).first().click();

    // The character was on every choice in the data from the day the map was
    // built and had never once been rendered. Eleven grey cards in an order
    // nobody could account for is the same as no order at all.
    const cards = page.locator('[role="group"] button').filter({ hasText: /answers|more decisions/ });
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    const words = ["attacking", "solid", "counterattacking", "positional"];
    const seen = await Promise.all(
      words.map((w) => page.getByText(w, { exact: true }).count())
    );
    // Not all four have to be present against 1.d4, but the list cannot be
    // silent about character on every single card.
    expect(seen.reduce((a, b) => a + b, 0)).toBeGreaterThan(2);
  });

  test("says heavily recommended only when level, load and style all agree", async ({ page }) => {
    // The quiz answers are "whatever it takes" + "punish mistakes", and this
    // player is 1700. The Grünfeld is counterattack / heavy / club — all three
    // axes line up, and it is the only kind of card that earns the phrase.
    await throughQuiz(page);
    await page.getByRole("tab", { name: /As Black/i }).click();
    await page.getByText(/Against 1\.d4/).first().click();

    const grunfeld = page.getByRole("button", { name: /Grünfeld Defence/i }).first();
    await expect(grunfeld).toBeVisible({ timeout: 10_000 });
    await expect(grunfeld).toContainText(/heavily recommended/i);
    await expect(grunfeld).toContainText(/counterattacking/i);
    // And a card that earns it says ONLY that — not "heavily recommended" and
    // "suits your level" fighting for the same square inch.
    await expect(grunfeld).not.toContainText(/suits your level/i);

    // ── The control on the same screen ──────────────────────────────────
    // The Nimzo-Indian is `structure` and `medium` against a player who asked
    // for counterattacking and heavy. Different character, adjacent load — a
    // near miss, so the page says nothing. Tagging THIS is what put a negative
    // on five of the eight cards in the first cut.
    const nimzo = page.getByRole("button", { name: /Nimzo-Indian/i }).first();
    await expect(nimzo).toContainText(/positional/i);
    await expect(nimzo).not.toContainText(/doesn't fit your playstyle/i);
    await expect(nimzo).not.toContainText(/heavily recommended/i);
  });

  test("objects only where nothing they asked for is present", async ({ page }) => {
    await throughQuiz(page);
    await page.getByRole("tab", { name: /As Black/i }).click();
    await page.getByText(/Against 1\.e4/).first().click();
    await expect(page.getByRole("button", { name: /Najdorf/i }).first()).toBeVisible({
      timeout: 10_000,
    });

    // The Scandinavian is `solid` and `light` — the opposite end of the theory
    // scale AND a different game — for somebody who asked for counterattacking
    // and whatever it takes. Nothing they asked for is in it.
    const scandi = page.getByRole("button", { name: /Scandinavian/i }).first();
    await expect(scandi).toContainText(/doesn't fit your playstyle/i);

    // And it is the ONLY one on this list, out of eight. The complaint has to
    // stay a minority or it stops being read at all.
    const cards = page.locator('[role="group"] button').filter({ hasText: /answers|more decisions/ });
    const total = await cards.count();
    const complaints = await cards.filter({ hasText: /doesn't fit your playstyle/i }).count();
    expect(total).toBeGreaterThan(4);
    expect(complaints).toBeGreaterThan(0);
    expect(complaints * 3).toBeLessThan(total);
  });

  test("a level fit and a style mismatch are said together, not traded off", async ({ page }) => {
    // The case that forced the two axes apart. At 700 the King's Indian is
    // ranked FIRST because level leads — and it is `attack` against a player
    // who asked to punish mistakes. If the card can only say one thing, the
    // top suggestion carries an objection and no stated merit.
    await stub(page, 700);
    await throughQuiz(page);
    await page.getByRole("tab", { name: /As Black/i }).click();
    await page.getByText(/Against 1\.d4/).first().click();

    const kid = page.getByRole("button", { name: /King's Indian/i }).first();
    await expect(kid).toBeVisible({ timeout: 10_000 });
    await expect(kid).toContainText(/suits your level/i);
    await expect(kid).toContainText(/attacking/i);
    // It is `attack` against somebody who asked to punish mistakes — a
    // different character, which is the default state for three cards in four.
    // The page names the character and leaves it there.
    await expect(kid).not.toContainText(/doesn't fit your playstyle/i);
    await expect(kid).not.toContainText(/heavily recommended/i);
  });

  test("shows the answers it is ordering by, and lets them be changed", async ({ page }) => {
    await throughQuiz(page);
    // An invisible input that reorders every list on the page is a bug waiting
    // to be filed as "the suggestions are wrong".
    await expect(page.getByText(/Ordered for/)).toBeVisible();
    await expect(page.getByText("counterattacking", { exact: true }).first()).toBeVisible();

    // Make a pick, then re-take the quiz. The pick must survive: changing how
    // a list is SORTED is not a reason to discard what was chosen from it.
    await page.getByRole("tab", { name: /As Black/i }).click();
    await page.getByText(/Against 1\.d4/).first().click();
    await page.getByRole("button", { name: /Grünfeld Defence/i }).first().click();
    await expect(page.getByText(/Trompowsky/i).first()).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Change" }).click();
    await expect(page.getByRole("heading", { name: /how much theory/i })).toBeVisible();
    // Their existing answer is marked, so this reads as an edit, not a restart.
    await expect(page.getByText("your answer", { exact: true }).first()).toBeVisible();
    // And backing out keeps what they had rather than resetting to a default.
    await page.getByRole("button", { name: /Keep my current answers/i }).click();
    await expect(page.getByRole("heading", { name: "Your repertoire" })).toBeVisible();
    await expect(page.getByText(/Ordered for/)).toBeVisible();
    await expect(page.getByText("counterattacking", { exact: true }).first()).toBeVisible();
    await page.getByRole("tab", { name: /As Black/i }).click();
    await expect(page.getByText(/Trompowsky/i).first()).toBeVisible();
  });

  test("says how rare a rare slot is, and stays quiet about common ones", async ({ page }) => {
    await throughQuiz(page);
    await page.getByRole("tab", { name: /As Black/i }).click();

    // ── The control: the input whose answer is zero by definition ──────────
    // 1.e4 and 1.d4 are the two most common moves in chess. If a rarity pill
    // can appear on those, it can appear on anything and it means nothing.
    //
    // Scoped to those two rows rather than to the whole page. On the banded
    // corpus 1.Nf3 and 1.c4 ARE rare for an improving player — 2.7% and 3.2%,
    // against 10.4% and 6.1% at 2300+ — so a pill on them is the feature
    // working, and a page-wide count of zero would have been asserting a
    // property of the Elite corpus rather than of the rarity rule.
    for (const common of [/Against 1\.e4/, /Against 1\.d4/]) {
      const row = page.locator("button", { hasText: common }).first();
      await expect(row).toBeVisible();
      await expect(row).not.toContainText(/1 game in /);
    }

    await page.getByText(/Against 1\.d4/).first().click();
    await page.getByRole("button", { name: /Grünfeld Defence/i }).first().click();
    // The Grünfeld answers 1.d4 and leaves the sidelines, which really are rare.
    await expect(page.getByText(/Trompowsky/i).first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/^1 game in /).first()).toBeVisible();
  });
});

/**
 * Measuring the bracket against the player's own archive.
 *
 * The page has always said "% of your games" and the number came from 3.4M
 * games by 2300+ players. This is the path that makes it true, and the failure
 * that matters is not a crash: it is a wrong personal number, which no reader
 * can falsify. The stubbed archive is therefore built so the measured answer
 * and the corpus answer are far apart — 1.e4 is 47% of the corpus and 75% of
 * these games — so an assertion cannot pass against the wrong one.
 */
const ARCHIVE_HANDLE = "aayan";

function archive(counts: { e4: number; d4: number }, handle = ARCHIVE_HANDLE) {
  const games = [
    ...Array.from({ length: counts.e4 }, (_, i) => ({
      id: `e${i}`, platform: "lichess", moves: ["e4", "c6", "d4", "d5"],
      whiteUsername: "opponent", blackUsername: handle,
      result: "1-0", date: 1_750_000_000_000,
    })),
    ...Array.from({ length: counts.d4 }, (_, i) => ({
      id: `d${i}`, platform: "lichess", moves: ["d4", "Nf6", "c4", "g6"],
      whiteUsername: "opponent", blackUsername: handle,
      result: "0-1", date: 1_750_000_000_000,
    })),
  ];
  return { username: handle, platform: "lichess", games, totalGames: games.length };
}

async function withArchive(
  page: Page,
  body: unknown,
  profile: Record<string, unknown> = { lichessUsername: ARCHIVE_HANDLE, primaryPlatform: "lichess" }
) {
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({
      json: {
        user: { uid: "e2e", email: "e2e@example.com", handle: "e2e", displayName: "E2E", ...profile },
        isIntern: false, isAdmin: false,
      },
    })
  );
  await page.route("**/api/scout", (r) => r.fulfill({ json: body }));
}

/**
 * Press the measure button and get past the churn question.
 *
 * The question sits between the button and the fetch by design, so every test
 * that wants numbers has to answer it. Defaults to "start from scratch" so the
 * ordering assertions elsewhere are not quietly rearranged by a churn bonus.
 */
async function measureNow(page: Page, answer: RegExp = /Start from scratch/i) {
  await page.getByRole("button", { name: /Use my last 12 months/i }).click();
  await page.getByRole("button", { name: answer }).click();
}

test.describe("measured from your own games", () => {
  test("replaces the corpus frequency with yours, and says it did", async ({ page }) => {
    await withArchive(page, archive({ e4: 30, d4: 10 }));
    await throughQuiz(page);
    await page.getByRole("tab", { name: /As Black/i }).click();

    // Before: the corpus. A corpus row says "of games"; a personal row says
    // "of your games". The share itself is band-dependent and deliberately not
    // asserted — freezing it would make this a restatement of whichever corpus
    // happened to ship, which is how three probes in this repo went stale.
    await expect(page.getByText(/\d+% of games · nothing chosen/).first()).toBeVisible();
    await expect(page.getByTestId("corpus-provenance").first()).toContainText(/rated \d+–\d+/);

    await measureNow(page);

    // After: theirs. 30 of 40 games as Black faced 1.e4.
    await expect(page.getByText(/75% of your games · nothing chosen/)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/25% of your games · nothing chosen/)).toBeVisible();
    await expect(page.getByText(/Measured from 40 of your own games as Black/)).toBeVisible();
    // And the corpus rows are gone, not merely covered by the new ones.
    await expect(page.getByText(/\d+% of games · nothing chosen/)).toHaveCount(0);

    // ── The regression this whole substitution was moved for ─────────────
    // The summary and the row are two different sums over the same `reach`.
    // Substituting at the display fed the row and not the summary, and the
    // page said "1.e4, at 47% of games" three lines above "75% of your games".
    // (47% was the Elite share; the banded corpora put it elsewhere. The bug
    // was the two sums disagreeing, not the number either of them reached.)
    await expect(
      page.getByText(/The biggest thing you have no answer for is/)
    ).toContainText(/at 75% of your games/);
    await expect(page.getByText(/at \d+% of games(?! ·)/)).toHaveCount(0);
    // Their forty games account for every root, so nothing is left over.
    await expect(page.getByText(/too rare to plan for/)).toHaveCount(0);
  });

  test("names the move they already play, on every choice that commits to it", async ({ page }) => {
    await withArchive(page, archive({ e4: 30, d4: 10 }));
    await throughQuiz(page);
    await page.getByRole("tab", { name: /As Black/i }).click();
    await measureNow(page);
    await expect(page.getByText(/Measured from 40/)).toBeVisible({ timeout: 15_000 });

    await page.getByText(/Against 1\.e4/).first().click();
    const caro = page.getByRole("button", { name: /Caro-Kann Defence/i }).first();
    await expect(caro).toBeVisible({ timeout: 10_000 });
    // They answered 1...c6 in all thirty. The tag names the MOVE: several
    // openings share one move at this slot, and claiming they already play a
    // named opening would be false on all but one of them.
    await expect(caro).toContainText(/you already play c6/i);

    // The Najdorf commits to c5, which they never play. It must not be marked.
    const najdorf = page.getByRole("button", { name: /Najdorf/i }).first();
    await expect(najdorf).not.toContainText(/you already play/i);
  });

  // ── The failure that would ship silently ────────────────────────────────
  test("refuses to report zeros when the handle matches nothing", async ({ page }) => {
    // Forty real games, none of them theirs — a rename, a typo, or somebody
    // else's archive. Every slot would count zero, and a page of confident
    // zeros reads exactly like "you have never played any of this".
    await withArchive(page, archive({ e4: 30, d4: 10 }, "somebody-else"));
    await throughQuiz(page);
    await page.getByRole("tab", { name: /As Black/i }).click();
    await measureNow(page);

    await expect(page.getByText(/none of them are aayan/i)).toBeVisible({ timeout: 15_000 });
    // The corpus numbers are still standing, unlabelled as personal.
    await expect(page.getByText(/\d+% of games · nothing chosen/).first()).toBeVisible();
    // Precisely the ROW phrasing: the note above legitimately contains the
    // words "of your games" while explaining why the rows do not.
    await expect(page.getByText(/% of your games · nothing chosen/)).toHaveCount(0);
  });

  test("says the sample is too thin rather than dividing by it", async ({ page }) => {
    // Ten games as Black. One game is ten points of share; "40% of your games"
    // would be four games and a coin flip.
    await withArchive(page, archive({ e4: 7, d4: 3 }));
    await throughQuiz(page);
    await page.getByRole("tab", { name: /As Black/i }).click();
    await measureNow(page);

    await expect(page.getByText(/Only 10 of your games as Black/i)).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByText(/too few to work out your own frequencies/i)).toBeVisible();
    // The corpus numbers are still standing, unlabelled as personal.
    await expect(page.getByText(/\d+% of games · nothing chosen/).first()).toBeVisible();
    // Precisely the ROW phrasing: the note above legitimately contains the
    // words "of your games" while explaining why the rows do not.
    await expect(page.getByText(/% of your games · nothing chosen/)).toHaveCount(0);

    // Last, because it changes tab: the colour they have NO games in gets its
    // own sentence — "Only 0 of your games" reads like a bug, not an answer.
    await page.getByRole("tab", { name: /As White/i }).click();
    await expect(page.getByText(/None of the games we read were yours as White/i)).toBeVisible();
  });

  test("asks for a username only when there is not one already", async ({ page }) => {
    await withArchive(page, archive({ e4: 30, d4: 10 }), {});
    await throughQuiz(page);
    // No handle stored: this is the ordinary state for somebody who plays over
    // the board, so it points at the profile rather than reading as an error.
    await expect(page.getByText(/Add your Lichess or Chess\.com username/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Use my last 12 months/i })).toHaveCount(0);
  });
});

test.describe("deciding, and stopping", () => {
  test("asks how much to change before it reads anything", async ({ page }) => {
    await withArchive(page, archive({ e4: 30, d4: 10 }));
    await throughQuiz(page);
    await page.getByRole("tab", { name: /As Black/i }).click();

    await page.getByRole("button", { name: /Use my last 12 months/i }).click();
    // The question comes BEFORE the fetch, so nothing is measured yet.
    await expect(page.getByText(/how much of what you play should change/i)).toBeVisible();
    await expect(page.getByText(/Measured from/)).toHaveCount(0);
    await expect(page.getByText(/\d+% of games · nothing chosen/).first()).toBeVisible();

    await page.getByRole("button", { name: /Keep what I play/i }).click();
    await expect(page.getByText(/Measured from 40 of your own games/)).toBeVisible({
      timeout: 15_000,
    });

    // Asked once. Refreshing does not re-ask.
    await page.getByRole("button", { name: /Refresh/i }).click();
    await expect(page.getByText(/how much of what you play should change/i)).toHaveCount(0);
    await expect(page.getByText(/Measured from 40 of your own games/)).toBeVisible({
      timeout: 15_000,
    });
  });

  test("keep what I play puts their own move at the top of the list", async ({ page }) => {
    await withArchive(page, archive({ e4: 30, d4: 10 }));
    await throughQuiz(page);
    await page.getByRole("tab", { name: /As Black/i }).click();
    await page.getByRole("button", { name: /Use my last 12 months/i }).click();
    await page.getByRole("button", { name: /Keep what I play/i }).click();
    await expect(page.getByText(/Measured from 40/)).toBeVisible({ timeout: 15_000 });

    await page.getByText(/Against 1\.e4/).first().click();
    const cards = page.locator('[role="group"] button').filter({ hasText: /answers|more decisions/ });
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });
    // They answer 1...c6 in every game and said to keep it. The Caro-Kann is
    // the only curated choice that commits to c6, and it goes first — ahead of
    // the Sicilians the quiz answers would otherwise have ranked above it.
    await expect(cards.first()).toContainText(/Caro-Kann/);
    await expect(cards.first()).toContainText(/you already play c6/i);
  });

  test("locking is per colour, and Continue waits for both", async ({ page }) => {
    await withArchive(page, archive({ e4: 30, d4: 10 }));
    await throughQuiz(page);

    // Nothing chosen as White: there is nothing to commit to.
    const lockWhite = page.getByRole("button", { name: /Lock White/i });
    await expect(lockWhite).toBeDisabled();
    await expect(page.getByText(/Choose something as White first/i)).toBeVisible();

    // By ROLE, not by text: the coverage sentence above the rows also reads
    // "…is Your first move", and it comes first in the DOM, so getByText().first()
    // clicks a paragraph and the chooser never opens.
    await page.getByRole("button", { name: /Your first move/i }).first().click();
    // By name, not by the move: a choice button's accessible name starts with
    // the diagram's piece glyphs, so an anchored /^1\.e4/ matches nothing.
    await page.getByRole("button", { name: /London System/i }).first().click();
    await expect(lockWhite).toBeEnabled();
    await lockWhite.click();
    await expect(page.getByRole("button", { name: /White is locked/i })).toBeVisible();

    // Half a repertoire is the state everybody is already in. No Continue yet.
    await expect(page.getByRole("link", { name: /Continue — start learning/i })).toHaveCount(0);
    await expect(page.getByText(/Lock this one too and you are done/i)).toHaveCount(0);

    await page.getByRole("tab", { name: /As Black/i }).click();
    // Nothing chosen yet, so the bar asks for a choice rather than offering a
    // lock — locking an empty colour would be committing to nothing.
    await expect(page.getByText(/Choose something as Black first/i)).toBeVisible();

    await page.getByText(/Against 1\.e4/).first().click();
    await page.getByRole("button", { name: /Caro-Kann Defence/i }).first().click();
    // Now it can be locked, and it says what locking it will finish.
    await expect(page.getByText(/Lock this one too and you are done/i)).toBeVisible();
    await page.getByRole("button", { name: /Lock Black/i }).click();

    const go = page.getByRole("link", { name: /Continue — start learning/i });
    await expect(go).toBeVisible();
    await go.click();
    await expect(page).toHaveURL(/\/learn\/[^/]+$/, { timeout: 15_000 });
  });

  test("a locked colour stops taking changes until it is unlocked", async ({ page }) => {
    await withArchive(page, archive({ e4: 30, d4: 10 }));
    await throughQuiz(page);
    await page.getByRole("tab", { name: /As Black/i }).click();
    await page.getByText(/Against 1\.e4/).first().click();
    await page.getByRole("button", { name: /Caro-Kann Defence/i }).first().click();
    await expect(page.getByText(/Caro-Kann Defence/).first()).toBeVisible();

    await page.getByRole("button", { name: /Lock Black/i }).click();
    // The rows are still readable — locking is a decision, not a blindfold —
    // but they no longer open a chooser.
    await page.getByText(/Against 1\.d4/).first().click();
    await expect(page.getByRole("button", { name: /Grünfeld Defence/i })).toHaveCount(0);

    await page.getByRole("button", { name: /Black is locked/i }).click();
    await page.getByText(/Against 1\.d4/).first().click();
    await expect(page.getByRole("button", { name: /Grünfeld Defence/i }).first()).toBeVisible({
      timeout: 10_000,
    });
  });

  test("the lock survives a reload, because it is a decision not a mode", async ({ page }) => {
    await withArchive(page, archive({ e4: 30, d4: 10 }));
    await throughQuiz(page);
    await page.getByRole("tab", { name: /As Black/i }).click();
    await page.getByText(/Against 1\.e4/).first().click();
    await page.getByRole("button", { name: /Caro-Kann Defence/i }).first().click();
    await page.getByRole("button", { name: /Lock Black/i }).click();
    await expect(page.getByRole("button", { name: /Black is locked/i })).toBeVisible();

    await page.reload();
    await page.getByRole("button", { name: /Maybe later/i }).click({ timeout: 8000 }).catch(() => {});
    await page.getByRole("tab", { name: /As Black/i }).click();
    await expect(page.getByRole("button", { name: /Black is locked/i })).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("hierarchy and holes", () => {
  test("a dead-end branch is one line, not four tasks", async ({ page }) => {
    await stub(page, 1700);
    await throughQuiz(page);

    // 1.e4, then the Alapin against the Sicilian. Measured on the shipped map,
    // the Alapin's four branches carry NO curated choice between them — so
    // before this they arrived as four rows the product could not advise on,
    // visually identical to "Against the King's Pawn Game" at 25%.
    await page.locator("button").filter({ hasText: /nothing chosen/ }).first().click();
    await page.getByRole("button", { name: /^1\.e4/ }).first().click();
    await page.locator("button").filter({ hasText: /Against the Sicilian/i }).first().click();
    await page.getByRole("button", { name: /Alapin/i }).first().click();

    // The four collapse into one disclosure that says what they are WORTH.
    const hole = page.getByRole("button", { name: /more branches, .*% of games/ }).first();
    await expect(hole).toBeVisible({ timeout: 15_000 });
    await expect(hole).toContainText(/no recommended answer for these yet/i);
    // And it does not invent a claim about the player to soften our gap.
    await expect(page.getByText(/most players never need to/i)).toHaveCount(0);

    // The individual dead ends are NOT rows.
    await expect(page.getByText(/2\.c3 e6/)).toHaveCount(0);
    // ...until asked for, because the library behind them is real.
    await hole.click();
    await expect(page.getByText(/2\.c3 e6/).first()).toBeVisible();

    // Meanwhile the branches we CAN advise on are still rows.
    await expect(
      page.locator("button").filter({ hasText: /Against the King's Pawn Game/ })
    ).toHaveCount(1);
  });

  test("a sub-branch does not look like a first-class decision", async ({ page }) => {
    await stub(page, 1700);
    await throughQuiz(page);
    await page.locator("button").filter({ hasText: /nothing chosen/ }).first().click();
    await page.getByRole("button", { name: /^1\.e4/ }).first().click();

    const root = page.locator("button").filter({ hasText: /Your first move/ }).first();
    const sub = page.locator("button").filter({ hasText: /Against the King's Pawn Game/ }).first();
    await expect(sub).toBeVisible({ timeout: 15_000 });

    const rootBox = await root.boundingBox();
    const subBox = await sub.boundingBox();
    // Geometry, not styling: a decision already made and a branch of it must
    // not be the same size of thing on the page.
    expect(rootBox!.height).toBeGreaterThan(subBox!.height);
  });

  test("every suggestion card wears its character, not just a tag", async ({ page }) => {
    await stub(page, 1700);
    await throughQuiz(page);
    await page.locator("button").filter({ hasText: /nothing chosen/ }).first().click();
    await page.getByRole("button", { name: /^1\.e4/ }).first().click();
    await page.locator("button").filter({ hasText: /Against the Sicilian/i }).first().click();

    const openSicilian = page.getByRole("button", { name: /Open Sicilian/i }).first();
    const alapin = page.getByRole("button", { name: /Alapin/i }).first();
    await expect(openSicilian).toBeVisible({ timeout: 15_000 });

    const edge = (l: typeof openSicilian) =>
      l.evaluate((e) => getComputedStyle(e).borderLeftColor);
    const attacking = await edge(openSicilian); // red
    const positional = await edge(alapin); // teal
    expect(attacking).not.toBe(positional);
    // And the edge is a real one, not the default hairline.
    const width = await openSicilian.evaluate((e) => getComputedStyle(e).borderLeftWidth);
    expect(parseFloat(width)).toBeGreaterThan(2);
  });
});

/**
 * The corpus the numbers came from, on screen.
 *
 * This is not a cosmetic line. Before the banded corpora existed, every share
 * on this page was measured on Lichess Elite 2300+ while the page described
 * them as the reader's own games. The sentence is derived from the map's own
 * metadata rather than from the band that was requested, so a band whose file
 * is missing degrades to the Elite map AND to a sentence admitting it. What a
 * unit test cannot check is that the sentence reaches the screen at all, and
 * that the number in it is the band's and not the Elite corpus's.
 */
test.describe("corpus provenance", () => {
  test("names the reader's own band on the bracket", async ({ page }) => {
    await stub(page, 1400);
    await throughQuiz(page);
    const line = page.getByTestId("corpus-provenance").first();
    await expect(line).toBeVisible();
    // 1400 is `improving`: 233k games, 1200-1599, and the claim earned.
    await expect(line).toContainText("people at your level");
    await expect(line).toContainText("1200–1599");
    // The control. If the page had fallen back to Elite it would say 2300+,
    // and 3.4M rather than 233k — the two failures are distinguishable.
    await expect(line).not.toContainText("2300+");
  });

  test("admits the Elite corpus rather than claiming a band it does not have", async ({ page }) => {
    await stub(page, 1400);
    // Serve the request as though only the default map existed, which is what
    // a deployment missing a banded file looks like.
    await page.route("**/api/repertoire?band=*", async (route) => {
      const res = await route.fetch({ url: new URL(route.request().url()).origin + "/api/repertoire" });
      const body = await res.json();
      body.meta.band = null;
      body.meta.bandScale = null;
      await route.fulfill({ json: body });
    });
    await throughQuiz(page);
    const line = page.getByTestId("corpus-provenance").first();
    await expect(line).toBeVisible();
    await expect(line).toContainText("2300+");
    await expect(line).not.toContainText("your level");
  });
});
