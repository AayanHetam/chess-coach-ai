import { afterEach, describe, expect, it, vi } from "vitest";
import {
  arrivalTarget,
  isArrivalJumpEnabledPublic,
  type ArrivalInput,
} from "../arrivalJump";

const ready: ArrivalInput = {
  enabled: true,
  sweepLanded: true,
  freshLoad: true,
  standardRoot: true,
  puzzleMode: false,
  decisivePly: 15,
  ply: 0,
  touched: false,
  boardBusy: false,
  coachView: true,
};

describe("arrivalTarget", () => {
  it("a fresh load, the sweep in, the reader not moved: the decisive ply", () => {
    expect(arrivalTarget(ready)).toBe(15);
  });

  it.each([
    ["the flag off", { enabled: false }],
    ["the sweep not in, or a previous game's", { sweepLanded: false }],
    ["a restored or shared conversation", { freshLoad: false }],
    ["a game set up from a position", { standardRoot: false }],
    ["a puzzle", { puzzleMode: true }],
    ["no decisive move", { decisivePly: null }],
    ["the reader moved", { touched: true }],
    ["the cursor not at the start", { ply: 4 }],
    ["an exploration, a drill or the coach's jump", { boardBusy: true }],
    ["another view showing", { coachView: false }],
  ] as const)("stays put with %s", (_, over) => {
    expect(arrivalTarget({ ...ready, ...over })).toBeNull();
  });
});

describe("isArrivalJumpEnabledPublic", () => {
  afterEach(() => vi.unstubAllEnvs());
  it("off by default, the env either way", () => {
    vi.stubEnv("NEXT_PUBLIC_COACH_ARRIVAL_JUMP", "");
    expect(isArrivalJumpEnabledPublic()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_COACH_ARRIVAL_JUMP", "1");
    expect(isArrivalJumpEnabledPublic()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_COACH_ARRIVAL_JUMP", "off");
    expect(isArrivalJumpEnabledPublic()).toBe(false);
  });
});
