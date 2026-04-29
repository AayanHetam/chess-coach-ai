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
    enforced: process.env.AUTH_ENFORCED === "true",
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
    appBaseUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  };
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
  }
  if (opts.needsEmail && !env.email.resendApiKey) {
    missing.push("RESEND_API_KEY");
  }
  if (missing.length) {
    throw new Error(`Missing required auth env: ${missing.join(", ")}`);
  }
}
