/**
 * Route-level tests for /api/puzzle-sessions (acceptance criterion #5:
 * "API misuse is handled: unauthenticated calls return a clean 401 (no
 * 500s); malformed payloads 400.").
 *
 * The vitest env is `node`, so we mock the auth guard and the Firestore
 * Admin SDK rather than reaching a real backend. Two seams:
 *   - requireSession() → either { session } or { response: 401 }
 *   - getAdminFirestore() → a chainable fake capturing the write / read
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireSession, mockGetAdminFirestore } = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockGetAdminFirestore: vi.fn(),
}));

vi.mock("@/lib/auth/session", () => ({ requireSession: mockRequireSession }));
vi.mock("@/lib/server/firebaseAdmin", () => ({
  getAdminFirestore: mockGetAdminFirestore,
  AdminConfigError: class AdminConfigError extends Error {},
}));

import { GET, POST } from "../route";

// ─── fixtures ────────────────────────────────────────────────────────

function validSession() {
  return {
    id: "sess-1234",
    startedAt: 1_700_000_000_000,
    endedAt: 1_700_000_100_000,
    endReason: "finished" as const,
    ratingStart: 1200,
    ratingEnd: 1230,
    results: [
      {
        id: "res-1",
        ratingBefore: 1200,
        ratingAfter: 1230,
        solved: true,
        theme: "fork",
        timeMs: 8400,
        puzzle: {
          id: "pz-1",
          fen: "r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 1",
          solution: ["Nf6", "Ng5"],
          rating: 1250,
          themes: ["fork", "opening"],
        },
      },
    ],
  };
}

function makeRequest(body: unknown, raw?: string): Request {
  return new Request("http://localhost:3000/api/puzzle-sessions", {
    method: "POST",
    body: raw ?? JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

/** Chainable Firestore fake: users/{uid}/puzzleSessions/{id}.set / .get */
function fakeFirestore(getSnap: { docs: Array<{ data: () => unknown }> } = { docs: [] }) {
  const set = vi.fn().mockResolvedValue(undefined);
  const get = vi.fn().mockResolvedValue(getSnap);
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  Object.assign(chain, {
    collection: vi.fn(self),
    doc: vi.fn(self),
    orderBy: vi.fn(self),
    limit: vi.fn(self),
    set,
    get,
  });
  return { db: chain, set, get };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── unauthenticated → clean 401, never 5xx ──────────────────────────

describe("puzzle-sessions auth guard", () => {
  it("POST returns 401 (not 500) when unauthenticated", async () => {
    mockRequireSession.mockResolvedValue({
      response: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    });

    const res = await POST(makeRequest(validSession()));
    expect(res.status).toBe(401);
    expect(res.status).toBeLessThan(500);
    // Firestore must never be touched on the unauth path.
    expect(mockGetAdminFirestore).not.toHaveBeenCalled();
  });

  it("GET returns 401 (not 500) when unauthenticated", async () => {
    mockRequireSession.mockResolvedValue({
      response: NextResponse.json({ error: "Not signed in." }, { status: 401 }),
    });

    const res = await GET();
    expect(res.status).toBe(401);
    expect(res.status).toBeLessThan(500);
    expect(mockGetAdminFirestore).not.toHaveBeenCalled();
  });
});

// ─── authenticated but malformed → 400 ───────────────────────────────

describe("puzzle-sessions payload validation", () => {
  beforeEach(() => {
    mockRequireSession.mockResolvedValue({ session: { uid: "uid-1" } });
  });

  it("returns 400 on invalid JSON body", async () => {
    const res = await POST(makeRequest(undefined, "{not json"));
    expect(res.status).toBe(400);
    expect(mockGetAdminFirestore).not.toHaveBeenCalled();
  });

  it("returns 400 when a required field is missing", async () => {
    const { results: _drop, ...noResults } = validSession();
    const res = await POST(makeRequest(noResults));
    expect(res.status).toBe(400);
    expect(mockGetAdminFirestore).not.toHaveBeenCalled();
  });

  it("returns 400 on an out-of-range rating", async () => {
    const bad = validSession();
    bad.ratingStart = 99999; // exceeds z max(4000)
    const res = await POST(makeRequest(bad));
    expect(res.status).toBe(400);
  });

  it("returns 400 on a bad endReason enum", async () => {
    const bad = { ...validSession(), endReason: "quit" };
    const res = await POST(makeRequest(bad));
    expect(res.status).toBe(400);
  });
});

// ─── authenticated + valid → persists and reads back ─────────────────

describe("puzzle-sessions happy path", () => {
  beforeEach(() => {
    mockRequireSession.mockResolvedValue({ session: { uid: "uid-1" } });
  });

  it("POST persists a valid session under the user and returns 201", async () => {
    const { db, set } = fakeFirestore();
    mockGetAdminFirestore.mockResolvedValue(db);

    const res = await POST(makeRequest(validSession()));
    expect(res.status).toBe(201);
    expect(set).toHaveBeenCalledTimes(1);
    const written = set.mock.calls[0][0] as Record<string, unknown>;
    expect(written.id).toBe("sess-1234");
    expect(written).toHaveProperty("savedAt");
  });

  it("GET returns the user's sessions newest-first shape", async () => {
    const { db, get } = fakeFirestore({
      docs: [{ data: () => validSession() }],
    });
    mockGetAdminFirestore.mockResolvedValue(db);

    const res = await GET();
    expect(res.status).toBe(200);
    expect(get).toHaveBeenCalledTimes(1);
    const json = (await res.json()) as { sessions: Array<{ id: string }> };
    expect(json.sessions).toHaveLength(1);
    expect(json.sessions[0].id).toBe("sess-1234");
  });
});
