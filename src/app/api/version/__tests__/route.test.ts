import { describe, it, expect, beforeEach, afterEach } from "vitest";

/**
 * /api/version is how Deploy verify decides whether prod is serving main, so
 * a wrong answer here is not cosmetic: reporting "dev" reads as "prod is
 * frozen" and, since 2026-08-17, triggers an automatic recovery deploy.
 *
 * The BUILD_SHA fallback exists because Vercel injects VERCEL_GIT_COMMIT_SHA
 * only for git-integration builds. Commits authored by a non-member are
 * refused by Vercel and can only ship via scripts/deploy/deploy-sha.sh, which
 * uploads a plain directory — no git metadata, so nothing is injected. That
 * script passes BUILD_SHA instead, because VERCEL_* names are reserved and
 * --build-env VERCEL_GIT_COMMIT_SHA is dropped without warning.
 */

const ENV_KEYS = [
  "VERCEL_GIT_COMMIT_SHA",
  "VERCEL_GIT_COMMIT_REF",
  "BUILD_SHA",
  "BUILD_REF",
  "VERCEL_ENV",
] as const;

let saved: Record<string, string | undefined>;

async function readVersion() {
  // Re-import per case: the route reads process.env at call time, but a fresh
  // module keeps this honest if that ever changes to module scope.
  const mod = await import("../route");
  const res = await mod.GET();
  return (await res.json()) as {
    sha: string;
    ref: string | null;
    env: string;
  };
}

beforeEach(() => {
  saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
  for (const k of ENV_KEYS) delete process.env[k];
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("/api/version reports which commit is live", () => {
  it("prefers the git integration's SHA when Vercel injected one", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "a".repeat(40);
    process.env.VERCEL_GIT_COMMIT_REF = "main";
    const v = await readVersion();
    expect(v.sha).toBe("a".repeat(40));
    expect(v.ref).toBe("main");
  });

  it("falls back to BUILD_SHA for a deploy that carried no git metadata", async () => {
    // The author-blocked path: deploy-sha.sh uploads a bare tree, so Vercel
    // injects nothing and only BUILD_SHA is present.
    process.env.BUILD_SHA = "b".repeat(40);
    process.env.BUILD_REF = "main";
    const v = await readVersion();
    expect(v.sha).toBe("b".repeat(40));
    expect(v.ref).toBe("main");
  });

  it("lets the git integration win when both are set", async () => {
    // A redeploy through git after a manual recovery: the injected value is
    // the authoritative one, and a stale BUILD_SHA must not shadow it.
    process.env.VERCEL_GIT_COMMIT_SHA = "c".repeat(40);
    process.env.BUILD_SHA = "d".repeat(40);
    const v = await readVersion();
    expect(v.sha).toBe("c".repeat(40));
  });

  it('still reports "dev" locally, where neither is set', async () => {
    const v = await readVersion();
    expect(v.sha).toBe("dev");
    expect(v.ref).toBeNull();
  });
});
