"use client";

import { type CSSProperties } from "react";

/**
 * Chess Masti — Bullseye Globe Loader
 * -----------------------------------
 * The brand bullseye (finial dot + 3 rings) rendered as great-circles of a
 * sphere. Each ring tumbles on its own axis at 2 / 3 / 4 turns per 5s, so the
 * whole set realigns into the flat bullseye every 5 seconds. Pure CSS 3D — no
 * dependencies, no WebGL. Works anywhere React runs.
 *
 *   <Loader />                         // default 260px, "Loading" caption
 *   <Loader size={120} showLabel={false} />   // compact inline spinner
 *   <Loader color="#F97316" label="Analyzing…" />
 */

const KEYFRAMES = `
@keyframes cmRingA { from { transform: rotate3d(1, 0.32, 0, 0deg); }   to { transform: rotate3d(1, 0.32, 0, 360deg); } }
@keyframes cmRingB { from { transform: rotate3d(0.32, 1, 0, 360deg); } to { transform: rotate3d(0.32, 1, 0, 0deg); } }
@keyframes cmRingC { from { transform: rotate3d(0.6, 0.55, 0.55, 0deg); } to { transform: rotate3d(0.6, 0.55, 0.55, 360deg); } }
@keyframes cmCore  { 0%,100% { transform: scale(0.8); opacity: 0.65; } 50% { transform: scale(1.18); opacity: 1; } }
@keyframes cmGlow  { 0%,100% { opacity: 0.55; transform: scale(0.92); } 50% { opacity: 0.9; transform: scale(1.08); } }
@keyframes cmDots  { 0%,100% { opacity: 0.25; } 50% { opacity: 1; } }
`;

export function Loader({
  size = 260,
  color = "#F97316",
  label = "Loading",
  showLabel = true,
}: {
  size?: number;
  color?: string;
  label?: string;
  showLabel?: boolean;
}) {
  const u = size / 260; // scale factor relative to the 260px reference design
  const border = Math.max(2, Math.round(4 * u));

  const ringBase: CSSProperties = {
    position: "absolute",
    inset: 0,
    margin: "auto",
    borderRadius: "50%",
    borderStyle: "solid",
    borderColor: color,
    borderWidth: border,
    transformStyle: "preserve-3d",
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 54 * u,
      }}
    >
      <style>{KEYFRAMES}</style>

      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          perspective: 900 * u,
        }}
      >
        {/* soft glow */}
        <div
          style={{
            position: "absolute",
            width: 200 * u,
            height: 200 * u,
            borderRadius: "50%",
            background: `radial-gradient(circle, ${hexA(color, 0.32)}, ${hexA(color, 0)} 68%)`,
            filter: "blur(2px)",
            animation: "cmGlow 2.5s ease-in-out infinite",
          }}
        />

        {/* 3D stage */}
        <div style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d" }}>
          <div style={{ ...ringBase, width: 212 * u, height: 212 * u, boxShadow: `0 0 ${16 * u}px ${hexA(color, 0.35)}`, animation: "cmRingA 2.5s linear infinite" }} />
          <div style={{ ...ringBase, width: 150 * u, height: 150 * u, boxShadow: `0 0 ${14 * u}px ${hexA(color, 0.32)}`, animation: "cmRingB 1.6667s linear infinite" }} />
          <div style={{ ...ringBase, width: 90 * u, height: 90 * u, boxShadow: `0 0 ${12 * u}px ${hexA(color, 0.3)}`, animation: "cmRingC 1.25s linear infinite" }} />
          <div
            style={{
              position: "absolute",
              inset: 0,
              margin: "auto",
              width: 26 * u,
              height: 26 * u,
              borderRadius: "50%",
              background: color,
              boxShadow: `0 0 ${18 * u}px ${hexA(color, 0.7)}`,
              animation: "cmCore 1.25s ease-in-out infinite",
            }}
          />
        </div>
      </div>

      {showLabel && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span
            style={{
              fontSize: 11,
              letterSpacing: "0.34em",
              textTransform: "uppercase",
              color: "rgba(255,255,255,0.5)",
              fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            }}
          >
            {label}
          </span>
          <span style={{ display: "flex", gap: 5 }}>
            {[0, 0.2, 0.4].map((d) => (
              <span
                key={d}
                style={{
                  width: 5,
                  height: 5,
                  borderRadius: "50%",
                  background: color,
                  animation: `cmDots 1.2s ease-in-out ${d}s infinite`,
                }}
              />
            ))}
          </span>
        </div>
      )}
    </div>
  );
}

/** #RRGGBB + alpha -> rgba() string */
function hexA(hex: string, a: number) {
  const m = hex.replace("#", "");
  const r = parseInt(m.slice(0, 2), 16);
  const g = parseInt(m.slice(2, 4), 16);
  const b = parseInt(m.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export default Loader;
