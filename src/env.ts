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
