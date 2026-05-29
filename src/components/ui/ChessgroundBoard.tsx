"use client";

import "chessground/assets/chessground.base.css";
import "chessground/assets/chessground.brown.css";
import "chessground/assets/chessground.cburnett.css";

import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import type { Config } from "chessground/config";
import type { Key } from "chessground/types";
import { useEffect, useRef } from "react";

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
}

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
        brushes: {
          green: { key: "g", color: "#22c55e", opacity: 0.9, lineWidth: 10 },
          red: { key: "r", color: "#ef4444", opacity: 0.9, lineWidth: 10 },
          blue: { key: "b", color: "#3b82f6", opacity: 0.9, lineWidth: 10 },
          yellow: { key: "y", color: "#F97316", opacity: 0.9, lineWidth: 10 },
          purple: { key: "p", color: "#A855F7", opacity: 0.9, lineWidth: 10 },
          gold: { key: "go", color: "#FBBF24", opacity: 0.95, lineWidth: 11 },
          paleBlue: { key: "pb", color: "#3b82f6", opacity: 0.4, lineWidth: 15 },
          paleGreen: { key: "pg", color: "#22c55e", opacity: 0.4, lineWidth: 15 },
          paleRed: { key: "pr", color: "#ef4444", opacity: 0.4, lineWidth: 15 },
          palePurple: { key: "pp", color: "#A855F7", opacity: 0.45, lineWidth: 15 },
          paleGrey: { key: "pgr", color: "rgba(255,255,255,0.3)", opacity: 0.4, lineWidth: 15 },
        },
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

  return (
    <div
      style={{
        width: "100%",
        position: "relative",
        aspectRatio: "1 / 1",
      }}
    >
      <div
        ref={containerRef}
        className="cg-wrap"
        style={{ width: "100%", height: "100%" }}
      />
    </div>
  );
}
