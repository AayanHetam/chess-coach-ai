import { test, expect } from "@playwright/test";
import { horizontalOverflow, waitForStableFen } from "../helpers";

/**
 * Masti the Monkey, the mascot, on the surfaces where he matters most.
 *
 * What these guard: he is on the first screen of the landing without pushing
 * the primary CTA under the fold (the stage is sized for a phone's first screen),
 * he never adds sideways scroll, he rests on a still (the animation is a
 * bounded burst, never a forever loop), reduced-motion visitors never see the
 * animation at all, and the coach surfaces wear his face.
 */

test.describe("Masti on the landing", () => {
  test("is on the first screen and the primary CTA stays above the fold", async ({
    page,
  }) => {
    await page.goto("/");
    // One stage on every viewport: he shares the first screen with the
    // headline on a phone as much as on a desktop.
    const hero = page.getByTestId("hero-masti");
    await expect(hero).toBeVisible();
    const img = hero.locator("img").first();
    await expect(img).toHaveAttribute(
      "src",
      /\/masti\/v\d+\/still\/wave\.png$/
    );
    await expect
      .poll(() =>
        img.evaluate((el) => {
          const i = el as HTMLImageElement;
          return i.complete && i.naturalWidth > 0;
        })
      )
      .toBe(true);

    const cta = page.getByRole("link", { name: /start your plan/i }).first();
    const box = await cta.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(1);
  });

  test("rests on the still: the current pack has no animation", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "the desktop hero is the placement that would animate");
    await page.goto("/");
    const figure = page.getByTestId("hero-masti").locator("[data-masti-mood]");
    await expect(figure).toBeVisible();
    // v5 is stills only, so no burst starts after mount and no animation
    // source is ever swapped in. When an animated pack lands, this test
    // flips back to asserting the bounded burst.
    await page.waitForTimeout(2500);
    await expect(figure).not.toHaveAttribute("data-masti-playing", "");
    expect(await figure.locator('source[srcset*="/anim/"]').count()).toBe(0);
    await expect(figure.locator("source")).toHaveAttribute(
      "srcset",
      /\/masti\/v\d+\/still\/wave\.webp 1x/
    );
  });

  test("never animates for a reduced-motion visitor", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.waitForTimeout(2500);
    const figures = page.locator("[data-masti-mood]");
    expect(await figures.count()).toBeGreaterThan(0);
    expect(await page.locator("[data-masti-playing]").count()).toBe(0);
    expect(await page.locator('source[srcset*="/anim/"]').count()).toBe(0);
  });
});

test.describe("Masti on the coach surfaces", () => {
  test("analysis: waves on the empty board and fronts the coach panel", async ({
    page,
  }) => {
    await page.goto("/analysis");
    await expect(page.getByTestId("masti-board-empty")).toBeVisible({
      timeout: 15_000,
    });
    // The nav pill carries a second "No game loaded" that is hidden on phones;
    // the board overlay's copy is the one that has to be on screen.
    await expect(
      page.getByText("No game loaded").filter({ visible: true }).first()
    ).toBeVisible();
    const header = page.getByTestId("coach-masti");
    await expect(header).toHaveAttribute("data-masti-avatar", "wave");
    // Masti is the coach, by name.
    await expect(page.getByTestId("coach-title")).toHaveText("Masti");
    // Each attitude wears its own face: pick the Grandmaster and the header
    // face leaves the wave for the thinking still. The chip lives in the
    // coach panel, which the phone layout keeps behind a tab.
    const chip = page.getByTestId("coach-attitude-chip");
    if (await chip.isVisible()) {
      await chip.click();
      const menu = page.getByRole("menu");
      await expect(menu.getByText("Masti's attitude")).toBeVisible();
      await expect(menu.locator("[data-masti-avatar]")).toHaveCount(7);
      await menu.getByText("Grandmaster Masti").click();
      await expect(header).toHaveAttribute("data-masti-avatar", "thinking", {
        timeout: 10_000,
      });
    }
  });

  test("puzzles: the coach wears Masti and reads while the answer is shown", async ({
    page,
  }) => {
    await page.context().addCookies([
      {
        name: "cm_consent",
        value: "accepted",
        domain: "127.0.0.1",
        path: "/",
      },
    ]);
    await page.goto("/puzzles");
    await waitForStableFen(page);
    const face = page.getByTestId("puzzle-coach-masti");
    await expect(face).toHaveAttribute("data-masti-avatar", "wave");
    await expect(page.getByTestId("puzzle-coach-title")).toHaveText("Masti");
    await page.getByRole("button", { name: /show solution/i }).click();
    // The demo drives the board, so he reads; when it is over, the answer
    // is an idea, never a celebration for a solution the user was shown.
    await expect(face).toHaveAttribute("data-masti-avatar", /thinking|idea/, {
      timeout: 10_000,
    });
    await expect(face).toHaveAttribute("data-masti-avatar", "idea", {
      timeout: 30_000,
    });
  });
});

test("404: Masti is dizzy and there is a way home", async ({ page }) => {
  const res = await page.goto("/this-square-is-off-the-board");
  expect(res?.status()).toBe(404);
  await expect(
    page.getByRole("heading", { name: /off the board/i })
  ).toBeVisible();
  await expect(page.locator('[data-masti-mood="defeated"]')).toBeVisible();
  await expect(page.getByRole("link", { name: /back home/i })).toBeVisible();
});
