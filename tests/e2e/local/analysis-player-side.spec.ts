import { test, expect, type Page } from "@playwright/test";
import { stubMaiaHealthy } from "../helpers";

/**
 * Who the reader is in a game, on /analysis (founder feedback 2026-10-16).
 *
 * - The side line and the side question name the players: "Coaching you as
 *   White (Lazer_Wizard). Switch to Black (opponent)", not "White (your
 *   choice)".
 * - The username saved on the profile is enough to know the side. It used to
 *   be ignored (only a key in localStorage counted), which is why the page
 *   kept asking.
 * - The opening-book note no longer follows the greeting, and nothing asks
 *   for one.
 * - The load dialog opens Chess.com on the saved username with the games
 *   already fetched, and the first username a reader loads a game from is
 *   saved to the profile, with a note saying so.
 */

const ME = "Lazer_Wizard";

const PGN = `[White "${ME}"]
[Black "opponent"]
[Result "1-0"]

1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 1-0`;

const CHIP_AS_WHITE = `Coaching you as White (${ME}). Switch to Black (opponent)`;

/** A signed-in reader whose profile the PATCH route really updates. */
async function stubAccount(page: Page, profile: Record<string, unknown>) {
  await page
    .context()
    .addCookies([
      { name: "cm_consent", value: "accepted", domain: "127.0.0.1", path: "/" },
    ]);
  await stubMaiaHealthy(page);
  const user: Record<string, unknown> = {
    uid: "e2e-user",
    email: "e2e@example.com",
    displayName: "E2E",
    handle: "e2e",
    onboardingCompletedAt: Date.now(),
    ...profile,
  };
  const patches: Record<string, unknown>[] = [];
  await page.route("**/api/auth/me", (r) =>
    r.fulfill({ json: { user, isIntern: false, isAdmin: false } })
  );
  await page.route("**/api/users/me", async (r) => {
    const body = r.request().postDataJSON() as Record<string, unknown>;
    patches.push(body);
    Object.assign(user, body);
    await r.fulfill({ json: { user } });
  });
  let bookExitCalls = 0;
  await page.route("**/api/book-exit", (r) => {
    bookExitCalls++;
    return r.fulfill({ status: 401, json: { error: "not signed in" } });
  });
  return { patches, bookExitCalls: () => bookExitCalls };
}

/** Chess.com's monthly archive, with one game this month for anybody asked. */
async function stubChessCom(page: Page) {
  const now = new Date();
  const thisMonth = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  const requested: string[] = [];
  await page.route("https://api.chess.com/**", (r) => {
    const url = r.request().url();
    requested.push(url);
    const games = url.endsWith(`/games/${thisMonth}`)
      ? [
          {
            uuid: "e2e-game-1",
            pgn: PGN,
            white: { username: ME, rating: 1400, "@id": "" },
            black: { username: "opponent", rating: 1390, "@id": "" },
            end_time: Math.floor(now.getTime() / 1000),
            time_class: "blitz",
          },
        ]
      : [];
    return r.fulfill({ json: { games } });
  });
  return requested;
}

async function openChessComTab(page: Page) {
  await page.goto("/analysis");
  // The empty board is the one way in on both projects: the header's
  // Load game button is not on phones.
  await page.getByTestId("masti-board-empty").click();
  const dialog = page.getByRole("dialog", { name: "Load game" });
  await dialog.getByRole("tab", { name: "Chess.com" }).click();
  return dialog;
}

const gameRow = (dialog: ReturnType<Page["getByRole"]>) =>
  dialog.getByRole("button", { name: /Lazer_Wizard\s+vs\s+opponent/ });

test("the profile's username decides the side, and the line names both players", async ({
  page,
}) => {
  const account = await stubAccount(page, { chesscomUsername: ME });
  await page.goto("/analysis?pgn=" + encodeURIComponent(PGN));

  await expect(page.getByTestId("player-side-chip")).toHaveText(CHIP_AS_WHITE, {
    timeout: 45_000,
  });
  await expect(page.getByTestId("player-side-ask")).toHaveCount(0);
  // The opening-book note said the same thing on every game. It is gone, and
  // nothing asks for it.
  await expect(page.getByTestId("book-exit")).toHaveCount(0);
  expect(account.bookExitCalls()).toBe(0);
});

test("with nothing to match, the question names both players", async ({
  page,
}) => {
  await stubAccount(page, {});
  await page.goto("/analysis?pgn=" + encodeURIComponent(PGN));

  const ask = page.getByTestId("player-side-ask");
  await expect(ask).toBeVisible({ timeout: 45_000 });
  await expect(
    ask.getByRole("button", { name: `I was playing White (${ME})` })
  ).toBeVisible();
  await ask
    .getByRole("button", { name: "I was playing Black (opponent)" })
    .click();
  await expect(page.getByTestId("player-side-chip")).toHaveText(
    `Coaching you as Black (opponent). Switch to White (${ME})`
  );
});

test("Chess.com opens on the saved username with the games already fetched", async ({
  page,
}) => {
  const account = await stubAccount(page, { chesscomUsername: ME });
  const requested = await stubChessCom(page);
  const dialog = await openChessComTab(page);

  await expect(
    dialog.getByRole("textbox", { name: "Chess.com username" })
  ).toHaveValue(ME);
  // No click on Fetch: the games are there when the tab opens.
  await expect(gameRow(dialog)).toBeVisible();
  expect(requested.some((u) => u.includes(`/player/${ME}/games/`))).toBe(true);

  await gameRow(dialog).click();
  await expect(page.getByTestId("player-side-chip")).toHaveText(CHIP_AS_WHITE, {
    timeout: 45_000,
  });
  // Already saved: nothing is saved again, and nothing is announced.
  expect(account.patches).toHaveLength(0);
  await expect(page.getByText(/as your Chess\.com username/)).toHaveCount(0);
});

test("the first username a reader loads a game from is saved to the profile, and says so", async ({
  page,
}) => {
  const account = await stubAccount(page, {});
  await stubChessCom(page);
  const dialog = await openChessComTab(page);

  const field = dialog.getByRole("textbox", { name: "Chess.com username" });
  await expect(field).toHaveValue("");
  await field.fill(ME);
  await field.press("Enter");
  await gameRow(dialog).click();

  await expect(
    page.getByText(
      `Saved ${ME} as your Chess.com username. Change it any time in Profile.`
    )
  ).toBeVisible();
  expect(account.patches).toEqual([{ chesscomUsername: ME }]);
  // The side comes from the username the games were fetched for.
  await expect(page.getByTestId("player-side-chip")).toHaveText(CHIP_AS_WHITE, {
    timeout: 45_000,
  });
});

test("another username is a lookup: it changes nothing saved", async ({
  page,
}) => {
  const account = await stubAccount(page, { chesscomUsername: "a_friend" });
  await stubChessCom(page);
  const dialog = await openChessComTab(page);

  const field = dialog.getByRole("textbox", { name: "Chess.com username" });
  await expect(field).toHaveValue("a_friend");
  await field.fill(ME);
  await field.press("Enter");
  await gameRow(dialog).click();

  await expect(page.getByTestId("player-side-chip")).toHaveText(CHIP_AS_WHITE, {
    timeout: 45_000,
  });
  expect(account.patches).toHaveLength(0);
  await expect(page.getByText(/as your Chess\.com username/)).toHaveCount(0);
});
