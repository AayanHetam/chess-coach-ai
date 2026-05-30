import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { updateCloudGameTranscript } from "../firestoreGames";
import type { SavedCoachMessage } from "@/types/game";

// updateCloudGameTranscript is a thin wrapper around fetch() that PATCHes
// the cloud-games endpoint with just the `coachTranscript` field. The route
// handler at src/app/api/games/[id]/route.ts does
// `ref.update({ ...body })` so the partial body merges into the existing
// Firestore doc — eval and metadata are preserved.

describe("updateCloudGameTranscript", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("PATCHes /api/games/{id} with only the coachTranscript field", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });

    const transcript: SavedCoachMessage[] = [
      { role: "user", content: "Analyze move 14.", ts: 1000 },
      { role: "coach", content: "Move 14 was a Mistake...", ply: 27, ts: 2000 },
    ];

    await updateCloudGameTranscript("ignored-user-id", "abc123", transcript);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/games/abc123");
    expect(init.method).toBe("PATCH");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body)).toEqual({ coachTranscript: transcript });
    // Critically: no `eval` field. The route's spread merge keeps the
    // existing eval intact; we never want to clobber it from this PATCH.
    expect(JSON.parse(init.body)).not.toHaveProperty("eval");
  });

  it("url-encodes the firestore id (handles ids with special characters)", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await updateCloudGameTranscript("u", "id/with slash", []);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/games/id%2Fwith%20slash");
  });

  it("throws when the response is not ok", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      text: async () => "session expired",
    });

    await expect(
      updateCloudGameTranscript("u", "abc", [
        { role: "user", content: "hi" },
      ]),
    ).rejects.toThrow(/403/);
  });

  it("accepts an empty transcript (used to clear the conversation)", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    await updateCloudGameTranscript("u", "abc", []);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
      coachTranscript: [],
    });
  });
});

describe("SavedCoachMessage shape", () => {
  it("structures a minimal user turn", () => {
    const msg: SavedCoachMessage = {
      role: "user",
      content: "What was wrong with 18.Bxh7?",
    };
    expect(msg.role).toBe("user");
    expect(msg.ply).toBeUndefined();
    expect(msg.ts).toBeUndefined();
  });

  it("structures a coach turn with ply + timestamp", () => {
    const msg: SavedCoachMessage = {
      role: "coach",
      content: "Bxh7 looks active but...",
      ply: 35,
      ts: 1717000000000,
    };
    expect(msg.role).toBe("coach");
    expect(msg.ply).toBe(35);
    expect(msg.ts).toBe(1717000000000);
  });
});
