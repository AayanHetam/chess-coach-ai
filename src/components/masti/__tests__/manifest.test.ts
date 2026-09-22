import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  MASTI_ANIM_DIMS,
  MASTI_LOOP_MS,
  MASTI_MOODS,
  MASTI_STILL_2X_DIMS,
  MASTI_STILL_DIMS,
  MASTI_STILL_SM_DIMS,
  MASTI_VERSION,
  isMastiMood,
  mastiAnimSrc,
  mastiAnimates,
  mastiStillPng,
  mastiStillSmSrc,
  mastiStillSrc,
  mastiStillSrcSet,
} from "../manifest";

/**
 * public/masti/<version>/manifest.json is written by
 * scripts/masti/build-assets.mjs; manifest.ts is its hand-kept mirror. This
 * test is the thing that makes a drift between them a red CI instead of a
 * broken image on the homepage.
 */

const root = path.resolve(__dirname, "..", "..", "..", "..");
const manifestPath = path.join(
  root,
  "public",
  "masti",
  MASTI_VERSION,
  "manifest.json"
);

interface Built {
  version: string;
  states: Record<
    string,
    {
      anim: {
        loopMs: number;
        lg: { path: string; width: number; height: number; bytes: number };
        sm: { path: string; width: number; height: number; bytes: number };
      } | null;
      still: {
        webp: { path: string; width: number; height: number; bytes: number };
        webp2x: { path: string; width: number; height: number; bytes: number };
        png: { path: string; width: number; height: number; bytes: number };
        sm: {
          width: number;
          height: number;
          webp: { path: string; bytes: number };
          png: { path: string; bytes: number };
        };
      };
    }
  >;
}

const built = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as Built;
const publicFile = (p: string) =>
  path.join(root, "public", p.replace(/^\//, ""));

describe("Masti asset manifest", () => {
  it("ships exactly the moods the code knows about", () => {
    expect(built.version).toBe(MASTI_VERSION);
    expect(Object.keys(built.states).sort()).toEqual([...MASTI_MOODS].sort());
  });

  it.each(MASTI_MOODS)(
    "%s: every referenced file exists and the paths match",
    (mood) => {
      const s = built.states[mood];
      // The code and the built pack agree on which moods animate at all.
      expect(s.anim !== null).toBe(mastiAnimates(mood));
      if (s.anim) {
        expect(s.anim.lg.path).toBe(mastiAnimSrc(mood, "lg"));
        expect(s.anim.sm.path).toBe(mastiAnimSrc(mood, "sm"));
      } else {
        expect(mastiAnimSrc(mood, "lg")).toBeNull();
        expect(mastiAnimSrc(mood, "sm")).toBeNull();
      }
      expect(s.still.webp.path).toBe(mastiStillSrc(mood, 1));
      expect(s.still.webp2x.path).toBe(mastiStillSrc(mood, 2));
      expect(s.still.png.path).toBe(mastiStillPng(mood));
      expect(s.still.sm.webp.path).toBe(mastiStillSmSrc(mood, "webp"));
      expect(s.still.sm.png.path).toBe(mastiStillSmSrc(mood, "png"));
      for (const p of [
        ...(s.anim ? [s.anim.lg.path, s.anim.sm.path] : []),
        s.still.webp.path,
        s.still.webp2x.path,
        s.still.png.path,
        s.still.sm.webp.path,
        s.still.sm.png.path,
      ]) {
        expect(fs.existsSync(publicFile(p)), `${p} missing under public/`).toBe(
          true
        );
        expect(fs.statSync(publicFile(p)).size).toBeGreaterThan(1000);
      }
    }
  );

  it.each(MASTI_MOODS)(
    "%s: dimensions and loop length agree with the code",
    (mood) => {
      const s = built.states[mood];
      if (s.anim) {
        expect(s.anim.loopMs).toBe(MASTI_LOOP_MS[mood]);
        expect({ width: s.anim.lg.width, height: s.anim.lg.height }).toEqual(
          MASTI_ANIM_DIMS.lg
        );
        expect({ width: s.anim.sm.width, height: s.anim.sm.height }).toEqual(
          MASTI_ANIM_DIMS.sm
        );
      } else {
        expect(MASTI_LOOP_MS[mood]).toBeUndefined();
      }
      expect({
        width: s.still.webp.width,
        height: s.still.webp.height,
      }).toEqual(MASTI_STILL_DIMS);
      expect({
        width: s.still.webp2x.width,
        height: s.still.webp2x.height,
      }).toEqual(MASTI_STILL_2X_DIMS);
      expect({ width: s.still.sm.width, height: s.still.sm.height }).toEqual(
        MASTI_STILL_SM_DIMS
      );
    }
  );

  it("keeps the animations under the weight budget so no page ships a megabyte of monkey", () => {
    for (const mood of MASTI_MOODS) {
      const s = built.states[mood];
      // Transparent animations (keyed from the pack's opaque GIFs) cost an
      // alpha plane; these are the measured ceilings plus headroom.
      if (s.anim) {
        expect(s.anim.lg.bytes).toBeLessThan(720_000);
        expect(s.anim.sm.bytes).toBeLessThan(320_000);
      }
      expect(s.still.webp.bytes).toBeLessThan(120_000);
      expect(s.still.sm.webp.bytes).toBeLessThan(40_000);
    }
  });

  it("builds a 1x/2x srcset and validates mood strings", () => {
    expect(mastiStillSrcSet("wave")).toBe(
      `/masti/${MASTI_VERSION}/still/wave.webp 1x, /masti/${MASTI_VERSION}/still/wave@2x.webp 2x`
    );
    expect(isMastiMood("wave")).toBe(true);
    expect(isMastiMood("waving-hi")).toBe(false);
    expect(isMastiMood(null)).toBe(false);
  });
});
