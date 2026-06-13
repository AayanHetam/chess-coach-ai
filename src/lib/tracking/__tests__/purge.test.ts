import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../supabase", () => ({ getTrackingSupabase: vi.fn() }));

import { getTrackingSupabase } from "../supabase";
import { purgeUserData } from "../purge";

const mockGetClient = vi.mocked(getTrackingSupabase);

/** Client whose delete().eq() resolves to the given result for every table. */
function clientResolving(result: { error: { message: string } | null; count: number | null }) {
  const eq = vi.fn().mockResolvedValue(result);
  const del = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ delete: del });
  return { client: { from } as never, from, del, eq };
}

beforeEach(() => vi.clearAllMocks());

describe("purgeUserData", () => {
  it("guards empty uid without touching the client", async () => {
    const res = await purgeUserData("");
    expect(res.errors).toContain("empty uid");
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it("deletes from all four tables and returns counts", async () => {
    const fk = clientResolving({ error: null, count: 5 });
    mockGetClient.mockResolvedValue(fk.client);

    const res = await purgeUserData("u1");

    const tables = fk.from.mock.calls.map((c) => c[0]);
    expect(tables).toEqual([
      "events",
      "llm_calls",
      "puzzle_attempts",
      "analysis_sessions",
    ]);
    expect(fk.eq).toHaveBeenCalledWith("uid", "u1");
    expect(res.errors).toEqual([]);
    expect(res.deleted).toEqual({
      events: 5,
      llm_calls: 5,
      puzzle_attempts: 5,
      analysis_sessions: 5,
    });
  });

  it("records a per-table error and marks that table null", async () => {
    const fk = clientResolving({ error: { message: "permission denied" }, count: null });
    mockGetClient.mockResolvedValue(fk.client);

    const res = await purgeUserData("u1");
    expect(res.errors.length).toBe(4); // one per table
    expect(res.errors[0]).toContain("events: permission denied");
    expect(res.deleted.events).toBeNull();
  });

  it("captures a thrown client without throwing", async () => {
    mockGetClient.mockRejectedValue(new Error("supabase down"));
    const res = await purgeUserData("u1");
    expect(res.errors[0]).toContain("supabase down");
  });
});
