import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/env", () => ({ getTrackingEnv: vi.fn() }));
vi.mock("../supabase", () => ({ getTrackingSupabase: vi.fn() }));

import { getTrackingEnv } from "@/env";
import { getTrackingSupabase } from "../supabase";
import { recordPuzzleAttempt, recordAnalysisSession } from "../domain";

const mockEnv = vi.mocked(getTrackingEnv);
const mockGetClient = vi.mocked(getTrackingSupabase);

function fakeClient(insertResult: { error: { message: string } | null }) {
  const insert = vi.fn().mockResolvedValue(insertResult);
  const from = vi.fn().mockReturnValue({ insert });
  return { client: { from } as never, from, insert };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEnv.mockReturnValue({ enabled: true } as never);
});

describe("recordPuzzleAttempt", () => {
  it("no-ops when tracking off", async () => {
    mockEnv.mockReturnValue({ enabled: false } as never);
    await recordPuzzleAttempt({ puzzleId: "p1" });
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it("maps fields and defaults hints_used to 0", async () => {
    const fk = fakeClient({ error: null });
    mockGetClient.mockResolvedValue(fk.client);
    await recordPuzzleAttempt({
      uid: "u1",
      puzzleId: "p1",
      correct: true,
      themes: ["fork", "pin"],
    });
    expect(fk.from).toHaveBeenCalledWith("puzzle_attempts");
    expect(fk.insert.mock.calls[0][0]).toMatchObject({
      uid: "u1",
      puzzle_id: "p1",
      correct: true,
      themes: ["fork", "pin"],
      hints_used: 0,
    });
  });

  it("swallows insert error and thrown client", async () => {
    mockGetClient.mockResolvedValue(fakeClient({ error: { message: "boom" } }).client);
    await expect(recordPuzzleAttempt({ puzzleId: "p1" })).resolves.toBeUndefined();
    mockGetClient.mockRejectedValue(new Error("down"));
    await expect(recordPuzzleAttempt({ puzzleId: "p1" })).resolves.toBeUndefined();
  });
});

describe("recordAnalysisSession", () => {
  it("stamps ended_at and omits started_at unless provided", async () => {
    const fk = fakeClient({ error: null });
    mockGetClient.mockResolvedValue(fk.client);
    await recordAnalysisSession({ uid: "u1", status: "completed", chatTurns: 3 });
    const row = fk.insert.mock.calls[0][0];
    expect(fk.from).toHaveBeenCalledWith("analysis_sessions");
    expect(row).toMatchObject({ uid: "u1", status: "completed", chat_turns: 3, moves_queried: 0 });
    expect(typeof row.ended_at).toBe("string");
    expect("started_at" in row).toBe(false);
  });

  it("uses the client started_at when supplied", async () => {
    const fk = fakeClient({ error: null });
    mockGetClient.mockResolvedValue(fk.client);
    await recordAnalysisSession({
      status: "abandoned",
      startedAt: "2026-06-13T10:00:00.000Z",
    });
    expect(fk.insert.mock.calls[0][0].started_at).toBe("2026-06-13T10:00:00.000Z");
  });

  it("no-ops when tracking off; swallows errors", async () => {
    mockEnv.mockReturnValue({ enabled: false } as never);
    await recordAnalysisSession({ status: "completed" });
    expect(mockGetClient).not.toHaveBeenCalled();

    mockEnv.mockReturnValue({ enabled: true } as never);
    mockGetClient.mockRejectedValue(new Error("down"));
    await expect(recordAnalysisSession({ status: "completed" })).resolves.toBeUndefined();
  });
});
