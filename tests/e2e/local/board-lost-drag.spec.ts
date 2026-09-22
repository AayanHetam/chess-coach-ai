import { test, expect, type Page } from "@playwright/test";
import { stubMaiaHealthy, waitForStableFen } from "../helpers";

/**
 * A drag the browser never finishes must not leave the board lying.
 *
 * react-chessboard drags through react-dnd's HTML5 backend, which ends a drag
 * only when a `dragend` reaches `window`. Chrome does not always send one —
 * release outside the browser window, or let the tab lose focus mid-drag —
 * and react-dnd then holds `isDragging` forever. The reported symptom, on
 * production /puzzles: the square the piece came from sat empty and painted
 * in the selection colour, a phantom copy of the piece hung frozen over
 * another piece (reading as two pieces on one square), and a white drop ring
 * stuck to a square nobody was over. The position on screen was not the
 * position in play, which on a puzzle board reads as a chess bug.
 *
 * `useLostDragRecovery` watches for the one thing that cannot happen during a
 * live drag — a mouse event — and re-delivers the missing `dragend`.
 *
 * The spec drives it by dispatching a real `dragstart` and never the matching
 * `dragend`, which is precisely the browser behaviour being defended against.
 * Playwright's own mouse always delivers `dragend`, so a scripted drag cannot
 * reach the state that shipped.
 */

/** Comfortably longer than the hook's settle window. */
const PAST_THE_SETTLE_WINDOW = 400;

/** What the board is showing, in the terms the failure is visible in. */
async function boardState(page: Page) {
  return page.evaluate(() => {
    const dragLayer = Array.from(document.querySelectorAll("div")).find(
      (el) =>
        el.style.position === "fixed" &&
        el.style.pointerEvents === "none" &&
        el.style.zIndex === "10"
    );
    return {
      // A piece react-dnd still thinks is in the air: invisible on its square.
      invisiblePieces: Array.from(document.querySelectorAll("[data-piece]"))
        .filter((el) => (el as HTMLElement).style.opacity === "0")
        .map((el) => el.closest("[data-square]")?.getAttribute("data-square")),
      // react-chessboard's drag layer — the phantom piece.
      phantomPiece: !!dragLayer,
      // react-chessboard's default drop-target ring is a white inset shadow.
      stuckDropRing: Array.from(document.querySelectorAll("[data-square]"))
        .filter((el) =>
          ((el as HTMLElement).style.boxShadow || "").includes("255, 255, 255")
        )
        .map((el) => el.getAttribute("data-square")),
    };
  });
}

const CLEAN = { invisiblePieces: [], phantomPiece: false, stuckDropRing: [] };

/**
 * Lift a piece of the side to move and let the browser forget to finish.
 * Returns the square it was lifted from.
 */
async function liftAPieceAndLoseTheDragend(page: Page) {
  return page.evaluate(() => {
    const turn = document
      .querySelector("[data-board-fen]")
      ?.getAttribute("data-board-fen")
      ?.split(" ")[1];
    const piece = Array.from(document.querySelectorAll("[data-piece]")).find(
      (el) => el.getAttribute("data-piece")?.startsWith(turn ?? "w")
    );
    if (!piece) throw new Error("no piece of the side to move on the board");
    const from = piece.closest("[data-square]")?.getAttribute("data-square");
    const event = (type: string, x: number, y: number) =>
      new DragEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        dataTransfer: new DataTransfer(),
      });

    const r = piece.getBoundingClientRect();
    piece.dispatchEvent(
      event("dragstart", r.x + r.width / 2, r.y + r.height / 2)
    );
    // Carry it over another square so the drop ring lights up, the way the
    // reported board had one stuck on a square nobody was over.
    const over = document.querySelectorAll("[data-square]")[20];
    const or = over.getBoundingClientRect();
    over.dispatchEvent(event("dragenter", or.x + 10, or.y + 10));
    over.dispatchEvent(event("dragover", or.x + 10, or.y + 10));
    return from;
  });
}

/**
 * A hand crossing the page, not one teleporting jump.
 *
 * The hook ignores mouse events for a moment after `dragstart`, because one
 * queued just before it can still be delivered just after and says nothing
 * about whether the drag is alive. A real pointer emits a stream of these for
 * as long as it moves, so that window is always crossed; a scripted pair of
 * jumps can land entirely inside it and prove nothing.
 */
async function moveThePointerAcross(page: Page) {
  for (let i = 0; i < 6; i++) {
    await page.mouse.move(120 + i * 40, 120 + i * 30);
    await page.waitForTimeout(80);
  }
}

test.describe("a drag the browser loses", () => {
  test.beforeEach(async ({ page, isMobile }) => {
    // Recovery is armed for the HTML5 backend only. A touch context runs
    // react-dnd's TouchBackend, which ends its own drags on `touchend` and
    // never strands one — see useLostDragRecovery.
    test.skip(isMobile, "the HTML5 drag backend is the desktop path");
    await stubMaiaHealthy(page);
    await page.context().addCookies([
      {
        name: "cm_consent",
        value: "accepted",
        domain: "127.0.0.1",
        path: "/",
      },
    ]);
  });

  test("/puzzles puts the piece back once the pointer moves", async ({
    page,
  }) => {
    await page.goto("/puzzles");
    const fenBefore = await waitForStableFen(page);

    expect(await boardState(page)).toEqual(CLEAN);

    const from = await liftAPieceAndLoseTheDragend(page);
    expect(from).toBeTruthy();

    // The board is now in the state that was reported.
    const stranded = await boardState(page);
    expect(stranded.phantomPiece).toBe(true);
    expect(stranded.invisiblePieces).toEqual([from]);

    await moveThePointerAcross(page);

    await expect
      .poll(() => boardState(page), { timeout: 5_000 })
      .toEqual(CLEAN);

    // Recovery puts the piece back on its square. It never plays a move.
    expect(
      await page
        .locator("[data-board-fen]")
        .first()
        .getAttribute("data-board-fen")
    ).toBe(fenBefore);
  });

  test("a real drag still completes normally", async ({ page }) => {
    // The guard against over-eager recovery: a drag the browser DOES finish
    // must survive the pointer moving, for as long as the piece is held.
    await page.goto("/puzzles");
    const fen = await waitForStableFen(page);

    const from = await page.evaluate((f) => {
      const turn = f.split(" ")[1];
      const piece = Array.from(document.querySelectorAll("[data-piece]")).find(
        (el) => el.getAttribute("data-piece")?.startsWith(turn)
      );
      return (
        piece?.closest("[data-square]")?.getAttribute("data-square") ?? null
      );
    }, fen);
    expect(from).toBeTruthy();

    const box = await page
      .locator(`[data-square="${from}"]`)
      .first()
      .boundingBox();
    if (!box) throw new Error("board square has no box");
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;

    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.mouse.move(cx + 10, cy + 10, { steps: 3 });
    for (let i = 0; i < 5; i++) {
      await page.mouse.move(cx + 20 + i * 12, cy + 20 + i * 8, { steps: 4 });
    }
    // Held well past the settle window, pointer moving throughout: if recovery
    // misread a live drag, it would have cut this one short by now.
    await page.waitForTimeout(PAST_THE_SETTLE_WINDOW);
    expect((await boardState(page)).phantomPiece).toBe(true);

    await page.mouse.move(cx + box.width, cy + box.height, { steps: 6 });
    await page.mouse.up();

    await expect.poll(() => boardState(page)).toEqual(CLEAN);
  });
});
