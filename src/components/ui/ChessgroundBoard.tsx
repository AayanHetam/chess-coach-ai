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
}

export function ChessgroundBoard({
  fen,
  orientation = "white",
  lastMove,
  viewOnly = true,
  shapes,
  check = false,
}: ChessgroundBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);

  // Mount: create chessground once
  useEffect(() => {
    if (!containerRef.current) return;
    const config: Config = {
      fen,
      orientation,
      lastMove: lastMove as Key[] | undefined,
      viewOnly,
      coordinates: true,
      check,
      animation: { enabled: true, duration: 220 },
      drawable: {
        enabled: !viewOnly,
        visible: true,
        defaultSnapToValidMove: true,
        brushes: {
          green: { key: "g", color: "#22c55e", opacity: 0.9, lineWidth: 10 },
          red: { key: "r", color: "#ef4444", opacity: 0.9, lineWidth: 10 },
          blue: { key: "b", color: "#3b82f6", opacity: 0.9, lineWidth: 10 },
          yellow: { key: "y", color: "#F97316", opacity: 0.9, lineWidth: 10 },
          paleBlue: { key: "pb", color: "#3b82f6", opacity: 0.4, lineWidth: 15 },
          paleGreen: { key: "pg", color: "#22c55e", opacity: 0.4, lineWidth: 15 },
          paleRed: { key: "pr", color: "#ef4444", opacity: 0.4, lineWidth: 15 },
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

  // Sync FEN / orientation / lastMove / check
  useEffect(() => {
    apiRef.current?.set({
      fen,
      orientation,
      lastMove: lastMove as Key[] | undefined,
      check,
    });
  }, [fen, orientation, lastMove, check]);

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
        // Aspect-ratio square — chessground fills the box
        aspectRatio: "1 / 1",
      }}
    >
      <div
        ref={containerRef}
        className="cg-wrap"
        style={{
          width: "100%",
          height: "100%",
        }}
      />
    </div>
  );
}
