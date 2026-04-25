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
  };
}
