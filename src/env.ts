import { z } from "zod";

/**
 * Server-side env validation. Imported from src/instrumentation.ts so
 * a missing required var crashes worker boot rather than silently 500ing
 * on the first AI request. Server-only — do NOT import from client code,
 * since process.env.ANTHROPIC_API_KEY is undefined in the browser bundle.
 */
export const envSchema = z.object({
  ANTHROPIC_API_KEY: z.string().min(1, "required for /api/enhanced-analysis"),
});

export function parseEnv(source: NodeJS.ProcessEnv = process.env) {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  - ${i.path.join(".") || "(root)"}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment variables:\n${issues}\n\n` +
        `Set them in .env.local (dev) or in your hosting provider (prod).`
    );
  }
  return result.data;
}

/**
 * Auth-related env. All optional so the merge is a non-event:
 * - AUTH_ENFORCED=false (default) → routes accept all requests, same as today.
 * - AUTH_ENFORCED=true + valid Firebase Admin creds → routes require Bearer token.
 * - AUTH_ENFORCED=true + missing/invalid creds → routes 503 with a loud log
 *   (catches "forgot to wire the secret" before it can become "front door open").
 *
 * Read via a function (not a top-level const) so tests can flip env vars
 * between cases without fighting the module cache.
 */
export function getAuthEnv() {
  return {
    // parseBoolEnv (not raw === "true") so a Vercel save of "true\n" still
    // enforces auth. Raw equality silently left routes OPEN on a trailing
    // newline — the same save hazard the codebase already got burned by on
    // MASTERMIND_VALIDATORS_ENABLED (audit §3.8). parseBoolEnv is a hoisted
    // function declaration below, so calling it here is fine.
    enforced: parseBoolEnv(process.env.AUTH_ENFORCED),
    firebase: {
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      // Vercel UI mangles \n in env vars; accept literal \n and unescape.
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    },
    session: {
      secret: process.env.SESSION_SECRET,
    },
    google: {
      clientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
      clientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
    },
    email: {
      resendApiKey: process.env.RESEND_API_KEY,
      fromAddress: process.env.RESEND_FROM_EMAIL ?? "noreply@chessmasti.com",
    },
    cmip: {
      fromEmail: process.env.CMIP_FROM_EMAIL ?? "noreply@chessmasti.com",
      adminEmail: process.env.CMIP_ADMIN_EMAIL,
      contactEmail: process.env.CMIP_CONTACT_EMAIL ?? "applications@chessmasti.com",
      // Personal email of the human admin who can reach /admin/intern-data.
      // Distinct from `adminEmail` (which is the role-mailbox recipient for
      // application notifications). Resolved 2026-05-17: aayanhetamsaria4@gmail.com.
      dashboardAdminEmail: process.env.CMIP_DASHBOARD_ADMIN_EMAIL,
    },
    supabase: {
      url: process.env.SUPABASE_URL,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    },
    appBaseUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  };
}

/**
 * Mastermind validator-pipeline feature flag (Stage B, 1.C.B.3).
 *
 * Reads `MASTERMIND_VALIDATORS_ENABLED` and returns the parsed boolean.
 * Default false on unset / unrecognized / empty — production stays off
 * until the §7.4 promotion criteria fire in a separate ops PR.
 *
 * Truthy values (case-insensitive, whitespace-trimmed): "true", "1", "yes".
 * Everything else — "false", "0", "no", "", undefined, garbage — is false.
 *
 * Memoized after first call within a process lifetime; the env var doesn't
 * change between requests in a Next.js server runtime. Tests that need to
 * flip the env between cases call `__resetMastermindEnvCacheForTests()`
 * (mirrors firebaseAdmin's __resetAdminCacheForTests seam).
 *
 * Function-based reader (T5 ratified — Option A, matches getAuthEnv style).
 * Not a Zod schema extension; this is a single optional boolean, not a
 * required secret.
 *
 * Distinct from any future MASTERMIND_ORCHESTRATOR_ENABLED (Phase 2) —
 * two flags, two rollout knobs, per MASTERMIND_BUILD_PLAN.md §12.2 T9.
 */
export function parseMastermindFlag(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

let cachedMastermindEnv: { validatorsEnabled: boolean } | undefined;

export function getMastermindEnv(): { validatorsEnabled: boolean } {
  if (cachedMastermindEnv) return cachedMastermindEnv;
  cachedMastermindEnv = {
    validatorsEnabled: parseMastermindFlag(
      process.env.MASTERMIND_VALIDATORS_ENABLED,
    ),
  };
  return cachedMastermindEnv;
}

/**
 * Test-only seam — clears the memoized cache so a vi.stubEnv flip
 * is visible to the next getMastermindEnv() call. Not for production
 * callers.
 */
export function __resetMastermindEnvCacheForTests(): void {
  cachedMastermindEnv = undefined;
}

/**
 * Contract Inversion shadow flags (PR-CI-1 / PR-CI-3).
 *
 * CONTRACT_SHADOW=true (PR-CI-1) logs one structured line per CoachContract
 * build ({contractId, buildMs, insightCount, contractBytes, evalIntegrity})
 * from the game-review path. It changes NOTHING about what is served — the
 * legacy prompt is rendered from the contract either way (byte-identical,
 * snapshot-pinned). Default false ⇒ zero new log output.
 *
 * CONTRACT_REFEREE_SHADOW=true (PR-CI-3) additionally runs the blocking-grade
 * output referee (src/lib/contract/referee.ts) per [INSIGHT] block on the
 * streaming game-review path — LOG ONLY, bytes forwarded unmodified (proven
 * by the SSE transcript byte-identity test). Flag off ⇒ the gate code is not
 * in the path at all (the route never constructs it).
 *
 * parseBoolEnv + memoized reader per the getMastermindEnv pattern (trim-
 * hardened against the Vercel trailing-\n save hazard).
 */
/**
 * PR-CI-4 additions (all trim-hardened, memoized, default-dark):
 *
 * CONTRACT_CATEGORIES — comma-separated category list (categoryClassifier
 * vocabulary, e.g. "position_analysis"). A request whose classified category
 * is listed AND that has a CoachContract serves through the ENFORCED
 * verbalizer-4.0 path (contractServing.ts). Default "" ⇒ fully dark: the
 * contract branch is never entered and legacy serving is byte-identical
 * (pinned by contractRollbackDrill.test.ts). Emptying the list IS the
 * rollback — legacy serves from its warm 3.6 cache.
 *
 * CONTRACT_REFEREE_MODE — "full" (default; Haiku relational parses included
 * in the enforce ladder) | "deterministic" (checks 2–5+7 only, zero Haiku
 * parse calls) — the cost lever, tech-lead decision #3.
 *
 * CONTRACT_CITATION_GRANULARITY — "sentence" (default) | "paragraph". The
 * pre-built persona fallback (plan §3): paragraph mode counts a claim
 * sentence as cited when its PARAGRAPH carries a [F:] token. Dark by
 * default; flip only if sentence-level citation tanks the persona rubric.
 *
 * PR-CI-5 addition:
 *
 * CONTRACT_UIDS — comma-separated session-uid allowlist (founder + CMIP
 * interns). A request from a listed uid serves through the ENFORCED path for
 * EVERY category, regardless of CONTRACT_CATEGORIES. This is the dogfood
 * lever that lets `game_review` — the highest-traffic surface — be armed for
 * Aayan alone before any general rollout, and emptying it is the rollback
 * (plan §7 PR-CI-5: "Rollback: empty the UID allowlist").
 *
 * Precedence is a plain OR (isContractServingArmed in
 * src/lib/contract/servingGate.ts): category listed (everyone) OR uid listed
 * (that user, all categories). Neither ⇒ legacy, byte-identical.
 */
export type ContractRefereeMode = "full" | "deterministic";
export type ContractCitationGranularity = "sentence" | "paragraph";

export interface ContractEnv {
  shadowEnabled: boolean;
  refereeShadowEnabled: boolean;
  /** Lowercased, trimmed, deduped category list; [] = enforcement dark. */
  categories: string[];
  /**
   * Trimmed, deduped, CASE-PRESERVING uid allowlist; [] = no dogfood arming.
   * Case is preserved on purpose — see parseContractUids.
   */
  uids: string[];
  refereeMode: ContractRefereeMode;
  citationGranularity: ContractCitationGranularity;
}

export function parseContractCategories(raw: string | undefined): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0),
    ),
  );
}

/**
 * Parse CONTRACT_UIDS (PR-CI-5).
 *
 * Hardening, in order of the hazards that actually bit this codebase:
 *  - `.trim()` per entry AND newline/tab tolerance — Vercel's env UI appends
 *    a trailing "\n" to saved values (the MASTERMIND_VALIDATORS_ENABLED
 *    "true\n" incident); a pasted allowlist also tends to arrive with spaces
 *    and line breaks between entries, so newlines split like commas do.
 *  - surrounding quotes stripped — a value pasted as `"uid1,uid2"` is the
 *    other common paste artifact.
 *  - dedupe, empties dropped.
 *
 * CASE IS **NOT** FOLDED, unlike parseContractCategories. Firebase/session
 * uids are case-SENSITIVE 28-char mixed-case tokens: lowercasing them would
 * make the allowlist match uids it was never given (and fail to match the one
 * it was). An allowlist that matches more than it was told to is a security
 * bug, so matching stays exact.
 */
export function parseContractUids(raw: string | undefined): string[] {
  if (!raw) return [];
  return Array.from(
    new Set(
      raw
        .split(/[,\n\r\t]+/)
        .map((s) => s.trim().replace(/^["']|["']$/g, "").trim())
        .filter((s) => s.length > 0),
    ),
  );
}

let cachedContractEnv: ContractEnv | undefined;

export function getContractEnv(): ContractEnv {
  if (cachedContractEnv) return cachedContractEnv;
  const modeRaw = (process.env.CONTRACT_REFEREE_MODE ?? "").trim().toLowerCase();
  const granularityRaw = (process.env.CONTRACT_CITATION_GRANULARITY ?? "")
    .trim()
    .toLowerCase();
  cachedContractEnv = {
    shadowEnabled: parseBoolEnv(process.env.CONTRACT_SHADOW),
    refereeShadowEnabled: parseBoolEnv(process.env.CONTRACT_REFEREE_SHADOW),
    categories: parseContractCategories(process.env.CONTRACT_CATEGORIES),
    uids: parseContractUids(process.env.CONTRACT_UIDS),
    refereeMode: modeRaw === "deterministic" ? "deterministic" : "full",
    citationGranularity: granularityRaw === "paragraph" ? "paragraph" : "sentence",
  };
  return cachedContractEnv;
}

/** Test-only seam — clears the memoized CONTRACT_SHADOW flag. */
export function __resetContractEnvCacheForTests(): void {
  cachedContractEnv = undefined;
}

/**
 * Generic boolean env parser. Truthy (case-insensitive, whitespace-trimmed):
 * "true", "1", "yes". Everything else — including "", undefined, and the
 * trailing "\n" Vercel's UI appends to multi-line saves — is false. The
 * `.trim()` is load-bearing: a prod flag saved as `"true\n"` bit us on the
 * Mastermind validators (see project memory).
 */
export function parseBoolEnv(raw: string | undefined): boolean {
  if (!raw) return false;
  const v = raw.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/**
 * Tracking / telemetry env (TRK-0). All optional so unset = inert:
 *  - TRACKING_ENABLED gates every write (default false; flip on per-env only
 *    after the privacy policy + consent banner are live, per TRACKING_PLAN.md).
 *  - Supabase creds point at a SEPARATE project from CMIP — distinct URL +
 *    service-role key, so the firehose + minors' content never co-mingle with
 *    intern eval data.
 *  - TRACKING_IP_SALT salts the SHA-256 IP hash so raw IPs never reach the DB.
 *
 * Function-based reader (matches getAuthEnv); the `enabled` flag is memoized
 * like getMastermindEnv since the var is stable across requests in a worker.
 */
let cachedTrackingEnabled: boolean | undefined;

export function getTrackingEnv() {
  if (cachedTrackingEnabled === undefined) {
    cachedTrackingEnabled = parseBoolEnv(process.env.TRACKING_ENABLED);
  }
  return {
    enabled: cachedTrackingEnabled,
    supabase: {
      url: process.env.TRACKING_SUPABASE_URL,
      serviceRoleKey: process.env.TRACKING_SUPABASE_SERVICE_ROLE_KEY,
    },
    ipSalt: process.env.TRACKING_IP_SALT,
  };
}

/** Test-only seam — clears the memoized TRACKING_ENABLED flag. */
export function __resetTrackingEnvCacheForTests(): void {
  cachedTrackingEnabled = undefined;
}

/**
 * Throw early if the tracking Supabase secrets are missing. Call from the
 * tracking client, NOT module-load, so a misconfigured deploy degrades to a
 * swallowed warn (writes are fire-and-forget) rather than crashing boot.
 */
export function assertTrackingSecrets(): void {
  const env = getTrackingEnv();
  const missing: string[] = [];
  if (!env.supabase.url) missing.push("TRACKING_SUPABASE_URL");
  if (!env.supabase.serviceRoleKey) missing.push("TRACKING_SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    throw new Error(`Missing required tracking env: ${missing.join(", ")}`);
  }
}

/**
 * Throw early if required auth-migration secrets are missing.
 * Call from auth route handlers, NOT module-load. The route then 503s
 * with a loud server log instead of crashing the whole app.
 */
export function assertAuthSecrets(opts: {
  needsSession?: boolean;
  needsAdmin?: boolean;
  needsGoogle?: boolean;
  needsEmail?: boolean;
  needsSupabase?: boolean;
} = {}): void {
  const env = getAuthEnv();
  const missing: string[] = [];
  if (opts.needsSession && (!env.session.secret || env.session.secret.length < 32)) {
    missing.push("SESSION_SECRET (≥32 chars)");
  }
  if (opts.needsAdmin) {
    if (!env.firebase.projectId) missing.push("FIREBASE_PROJECT_ID");
    if (!env.firebase.clientEmail) missing.push("FIREBASE_CLIENT_EMAIL");
    if (!env.firebase.privateKey) missing.push("FIREBASE_PRIVATE_KEY");
  }
  if (opts.needsGoogle) {
    if (!env.google.clientId) missing.push("GOOGLE_OAUTH_CLIENT_ID");
    if (!env.google.clientSecret) missing.push("GOOGLE_OAUTH_CLIENT_SECRET");
    // The OAuth redirect_uri is built from appBaseUrl. On Vercel the localhost
    // fallback would send Google a redirect_uri_mismatch for every sign-in —
    // fail loud (503) instead of silently building a broken authorize URL.
    if (process.env.VERCEL && !process.env.NEXT_PUBLIC_APP_URL) {
      missing.push("NEXT_PUBLIC_APP_URL (OAuth redirect_uri base)");
    }
  }
  if (opts.needsEmail && !env.email.resendApiKey) {
    missing.push("RESEND_API_KEY");
  }
  if (opts.needsSupabase) {
    if (!env.supabase.url) missing.push("SUPABASE_URL");
    if (!env.supabase.serviceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  }
  if (missing.length) {
    throw new Error(`Missing required auth env: ${missing.join(", ")}`);
  }
}

/**
 * Billing / pricing-pivot env (Stripe + freemium flag). All optional so an
 * unconfigured deploy stays inert: with FREEMIUM_ENABLED unset/false, gating is
 * a no-op (every user treated as premium) and the Stripe routes 503 loudly via
 * assertStripeSecrets() rather than crashing boot. Read via functions (matches
 * getAuthEnv/getTrackingEnv) so tests can flip vars without cache fighting.
 *
 * Mind the trailing-\n gotcha on FREEMIUM_ENABLED — parseBoolEnv trims it.
 */
export function getBillingEnv() {
  return {
    freemiumEnabled: parseBoolEnv(process.env.FREEMIUM_ENABLED),
    appBaseUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  };
}

export function getStripeEnv() {
  return {
    secretKey: process.env.STRIPE_SECRET_KEY,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
    priceId: process.env.STRIPE_PRICE_ID,
    publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
  };
}

/**
 * Throw early if required Stripe secrets are missing. Call from the Stripe
 * route handlers (checkout/webhook/portal), NOT module-load, so a deploy
 * without keys degrades to a loud 503 on those routes instead of crashing the
 * whole app and taking the free tier down with it.
 */
export function assertStripeSecrets(
  opts: { needsWebhook?: boolean } = {},
): void {
  const env = getStripeEnv();
  const missing: string[] = [];
  if (!env.secretKey) missing.push("STRIPE_SECRET_KEY");
  if (!env.priceId) missing.push("STRIPE_PRICE_ID");
  if (opts.needsWebhook && !env.webhookSecret) {
    missing.push("STRIPE_WEBHOOK_SECRET");
  }
  if (missing.length) {
    throw new Error(`Missing required Stripe env: ${missing.join(", ")}`);
  }
}
