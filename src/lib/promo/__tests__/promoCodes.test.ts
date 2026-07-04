/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/intern/supabase", () => ({
  getInternSupabase: vi.fn(async () => ({ rpc })),
}));
vi.mock("@/lib/server/users", () => ({
  updateSubscription: vi.fn().mockResolvedValue({}),
}));

import { redeemPromo } from "../promoCodes";
import { updateSubscription } from "@/lib/server/users";

const mockedUpdate = vi.mocked(updateSubscription);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("redeemPromo", () => {
  it("status 'ok' → comps the user premium", async () => {
    rpc.mockResolvedValue({ data: "ok", error: null });
    const r = await redeemPromo("u1", "akanksha2026");
    expect(r).toEqual({ ok: true, alreadyRedeemed: false });
    expect(mockedUpdate).toHaveBeenCalledWith(
      "u1",
      expect.objectContaining({ compedReason: "promo:AKANKSHA2026", plan: "premium" }),
    );
  });

  it("status 'already' → still comps (idempotent), flagged alreadyRedeemed", async () => {
    rpc.mockResolvedValue({ data: "already", error: null });
    const r = await redeemPromo("u1", "AKANKSHA2026");
    expect(r).toEqual({ ok: true, alreadyRedeemed: true });
    expect(mockedUpdate).toHaveBeenCalled();
  });

  it("status 'invalid' → error, no comp", async () => {
    rpc.mockResolvedValue({ data: "invalid", error: null });
    const r = await redeemPromo("u1", "NOPE");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid");
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("status 'revoked' → error, no comp", async () => {
    rpc.mockResolvedValue({ data: "revoked", error: null });
    const r = await redeemPromo("u1", "OLD");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("revoked");
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("status 'limit' → error, no comp", async () => {
    rpc.mockResolvedValue({ data: "limit", error: null });
    const r = await redeemPromo("u1", "FULL");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("limit");
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("rpc error (e.g. table not migrated) → 'unavailable', no comp", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    const r = await redeemPromo("u1", "AKANKSHA2026");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("unavailable");
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("comp write failure after redemption → 'unavailable' (never throws)", async () => {
    rpc.mockResolvedValue({ data: "ok", error: null });
    mockedUpdate.mockRejectedValueOnce(new Error("firestore down"));
    const r = await redeemPromo("u1", "AKANKSHA2026");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("unavailable");
  });

  it("empty code → invalid without hitting the DB", async () => {
    const r = await redeemPromo("u1", "   ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe("invalid");
    expect(rpc).not.toHaveBeenCalled();
  });
});
