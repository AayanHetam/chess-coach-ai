"use client";

import { useEffect } from "react";

/**
 * Put the piece back when the browser loses the end of a drag.
 *
 * react-chessboard drags pieces through react-dnd's HTML5 backend, and that
 * backend only ever ends a drag when a `dragend` event reaches `window`.
 * Chrome does not always send one — release the piece outside the browser
 * window, let the tab lose focus mid-drag (a screenshot hotkey does it), or
 * have the OS take the drag — and react-dnd then holds `isDragging` forever:
 *
 *   - the square you lifted from stays empty and painted in the selection
 *     colour, so the position on screen is not the position in play;
 *   - a phantom copy of the piece freezes wherever the pointer last was, and
 *     when that lands over a real piece it reads as two pieces on one square;
 *   - the white drop-target ring sticks to the last square hovered.
 *
 * Nothing clears it but completing another drag, so a visitor who lets go and
 * then just looks at the board sees a board that is wrong — on a puzzle board
 * that is indistinguishable from a chess bug, which is how it gets reported.
 *
 * react-dnd ships its own recovery for this (`endDragIfSourceWasRemovedFromDOM`)
 * but it returns early while the dragged node is still in the document, which
 * is exactly this case, so it never fires.
 *
 * The signal is the absence of mouse events: the browser dispatches none
 * between `dragstart` and `dragend`, so a `mousemove` arriving while a drag is
 * supposedly still in flight proves that drag is over. Measured rather than
 * assumed — a drag held across a dozen pointer moves and 1.5s delivers zero
 * mousemove events.
 *
 * The cure is the missing event itself. Dispatching `dragend` on `window` runs
 * the backend's own handler, which ends the drag down the normal path: the
 * phantom unmounts, the piece reappears, the drop ring clears, and
 * react-chessboard's `onPieceDragEnd` fires so the board clears its own
 * selection. Nothing remounts, so the board never blinks.
 *
 * Mouse only. On touch, react-chessboard runs react-dnd's TouchBackend, which
 * ends drags on `touchend` and never strands one this way; arming there would
 * only risk firing on the compatibility mouse events a tap emits.
 */

/**
 * How long after `dragstart` a mouse event stops being ambiguous.
 *
 * The browser can still deliver a `mousemove` that was queued just before
 * `dragstart` — that one says nothing about whether the drag is alive. Input
 * is dispatched in order, so a move this far behind means the queue drained
 * long ago and no drag is running.
 */
export const LOST_DRAG_SETTLE_MS = 150;

/**
 * Pure decision: did the browser lose this drag's `dragend`?
 *
 * `startedAt` is null when no drag is in flight, in which case there is
 * nothing to recover.
 */
export function isDragLost(startedAt: number | null, mouseMovedAt: number) {
  if (startedAt === null) return false;
  return mouseMovedAt - startedAt >= LOST_DRAG_SETTLE_MS;
}

export function useLostDragRecovery(): void {
  useEffect(() => {
    // TouchBackend ends its own drags; see the note above.
    if (typeof window === "undefined" || "ontouchstart" in window) return;

    let startedAt: number | null = null;

    const onDragStart = () => {
      startedAt = Date.now();
    };
    const onDragEnd = () => {
      startedAt = null;
    };
    const onMouseMove = () => {
      // Cheap guard first — this runs on every pointer move on the page.
      if (startedAt === null) return;
      if (!isDragLost(startedAt, Date.now())) return;
      // Cleared first: our own dispatch re-enters onDragEnd, and a second
      // mousemove in the same frame must not dispatch again.
      startedAt = null;
      window.dispatchEvent(new Event("dragend"));
    };

    window.addEventListener("dragstart", onDragStart, true);
    window.addEventListener("dragend", onDragEnd, true);
    window.addEventListener("mousemove", onMouseMove, true);
    return () => {
      window.removeEventListener("dragstart", onDragStart, true);
      window.removeEventListener("dragend", onDragEnd, true);
      window.removeEventListener("mousemove", onMouseMove, true);
    };
  }, []);
}
