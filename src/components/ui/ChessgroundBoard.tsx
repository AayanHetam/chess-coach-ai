"use client";

import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";

import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Config } from "chessground/config";
import type { Key } from "chessground/types";
import { useEffect, useRef } from "react";
import { CHESSGROUND_BRUSHES } from "./chessgroundBrushes";

export interface DrawShape {
  orig: string;
  dest?: string;
  brush?: string;
}

interface ChessgroundBoardProps {
  fen: string;
  orientation?: "white" | "black";
  lastMove?: [string, string] | Key[];
  viewOnly?: boolean;
  shapes?: DrawShape[];
  check?: boolean;
  /** "white" | "black" | "both" — which side can move pieces. Ignored if viewOnly. */
  movableColor?: "white" | "black" | "both";
  /** Map of source square → array of legal destination squares. */
  dests?: Map<string, string[]>;
  /** Fired when the user makes a move on the board (drag or click-click). */
  onMove?: (orig: string, dest: string) => void;
  /**
   * Bump to force a re-sync of the board to `fen` even when the string
   * didn't change. Needed because chessground commits a drag visually
   * before fielding the move event, so rejected moves need an explicit
   * revert. Parents bump this counter to undo a stale visual position.
   */
  syncTick?: number;
  /**
   * The app's own drawing (chessground's auto shapes): kept across a flip
   * and a re-sync, which clear the reader's `shapes`. Absent, untouched.
   */
  autoShapes?: DrawShape[];
  /**
   * Square to class (chessground's custom highlight), styled by
   * ANNOTATION_SQUARE_CSS, which is rendered only when this is set.
   */
  squareClasses?: ReadonlyMap<string, string>;
}

/**
 * Masti's rings (boardAnnotations.ts, ANNOTATION_SQUARE_CLASS): a box shadow
 * and a background, no layout property. The important flag lets a ring win
 * over the last-move square's own ring.
 */
export const ANNOTATION_SQUARE_CSS = [
  ".cg-wrap cg-board square.cm-anno-target{box-shadow:inset 0 0 0 3px rgba(56,189,248,0.9)!important}",
  ".cg-wrap cg-board square.cm-anno-threat{box-shadow:inset 0 0 0 3px rgba(248,113,113,0.95)!important;background-image:radial-gradient(circle,rgba(248,113,113,0.3),transparent 70%)}",
].join("\n");

export function ChessgroundBoard({
  fen,
  orientation = "white",
  lastMove,
  viewOnly = true,
  shapes,
  check = false,
  movableColor,
  dests,
  onMove,
  syncTick = 0,
  autoShapes,
  squareClasses,
}: ChessgroundBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  // Keep the latest onMove in a ref so chessground always sees the current
  // closure without us having to re-init the board on every parent render.
  const onMoveRef = useRef<typeof onMove>(onMove);
  useEffect(() => {
    onMoveRef.current = onMove;
  }, [onMove]);

  // Effective interactivity: not viewOnly AND a color is movable.
  // chessground v9.2.1 has a bug where toggling `viewOnly` via .set() after
  // mount doesn't rebind drag event listeners. Workaround: always mount
  // with viewOnly=false and gate interaction through draggable.enabled +
  // movable.color instead. Pieces are static when both are off.
  const interactive = !viewOnly && Boolean(movableColor);

  // Mount once
  useEffect(() => {
    if (!containerRef.current) return;
    const config: Config = {
      fen,
      orientation,
      lastMove: lastMove as Key[] | undefined,
      viewOnly: false,
      coordinates: true,
      check,
      animation: { enabled: true, duration: 220 },
      draggable: {
        enabled: interactive,
        showGhost: true,
        deleteOnDropOff: false,
      },
      selectable: { enabled: interactive },
      movable: {
        color: interactive ? movableColor : undefined,
        dests: interactive ? (dests as Map<Key, Key[]> | undefined) : undefined,
        free: false,
        showDests: true,
        events: {
          after: (orig: Key, dest: Key) => {
            onMoveRef.current?.(orig as string, dest as string);
          },
        },
      },
      highlight: { lastMove: true, check: true },
      drawable: {
        enabled: !viewOnly,
        visible: true,
        defaultSnapToValidMove: true,
        brushes: CHESSGROUND_BRUSHES,
      },
    };
    apiRef.current = Chessground(containerRef.current, config);
    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync FEN / orientation / lastMove / check. `syncTick` lets the parent
  // force a re-sync (e.g. to revert a rejected drag) even when `fen` itself
  // didn't change between renders.
  useEffect(() => {
    apiRef.current?.set({
      fen,
      orientation,
      lastMove: lastMove as Key[] | undefined,
      check,
    });
  }, [fen, orientation, lastMove, check, syncTick]);

  // Sync interactivity (movable color / dests / drag / events).
  // Always re-set events.after so the onMove callback is never wiped.
  // Never pass viewOnly here — it's pinned to false at the chessground
  // layer to avoid the v9.2.1 toggle-after-mount bug.
  useEffect(() => {
    if (!apiRef.current) return;
    apiRef.current.set({
      draggable: { enabled: interactive, showGhost: true },
      selectable: { enabled: interactive },
      movable: {
        color: interactive ? movableColor : undefined,
        dests: interactive ? (dests as Map<Key, Key[]> | undefined) : undefined,
        free: false,
        showDests: true,
        events: {
          after: (orig: Key, dest: Key) => {
            onMoveRef.current?.(orig as string, dest as string);
          },
        },
      },
    });
  }, [interactive, movableColor, dests]);

  // Sync drawn shapes (arrows/circles)
  useEffect(() => {
    if (!apiRef.current) return;
    apiRef.current.setShapes((shapes ?? []) as never);
  }, [shapes]);

  // The app's drawing. Auto shapes and the custom highlight survive a
  // `set({ fen })`, so a flip or a revert does not drop them.
  useEffect(() => {
    if (!apiRef.current || autoShapes === undefined) return;
    apiRef.current.setAutoShapes(autoShapes as never);
  }, [autoShapes]);
  useEffect(() => {
    if (!apiRef.current || squareClasses === undefined) return;
    apiRef.current.set({
      highlight: { custom: new Map(squareClasses) as Map<Key, string> },
    });
  }, [squareClasses]);

  return (
    <div
      style={{
        width: "100%",
        position: "relative",
        aspectRatio: "1 / 1",
      }}
    >
      {squareClasses !== undefined && <style>{ANNOTATION_SQUARE_CSS}</style>}
      <div
        ref={containerRef}
        className="cg-wrap"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
