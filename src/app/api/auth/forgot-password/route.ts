import { createHash, randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertAuthSecrets, getAuthEnv } from "@/env";
import { firstZodError, forgotPasswordSchema } from "@/lib/auth/validation";
import { getUserByEmail, setPasswordResetToken } from "@/lib/server/users";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";
import { sendPasswordResetEmail } from "@/lib/server/email";

export const runtime = "nodejs";

const TOKEN_TTL_MINUTES = 60;

export async function POST(request: Request) {
  try {
    assertAuthSecrets({ needsAdmin: true, needsEmail: true });
  } catch (err) {
    console.error("[auth/forgot-password]", err);
    return NextResponse.json({ error: "Authentication service unavailable" }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let input;
  try {
    input = forgotPasswordSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: firstZodError(err) }, { status: 400 });
    }
    throw err;
  }

  // Always respond OK so we don't leak which emails exist.
  const okResponse = NextResponse.json({ ok: true });

  try {
    const user = await getUserByEmail(input.email);
    if (!user) return okResponse;

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = createHash("sha256").update(rawToken).digest("hex");
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MINUTES * 60 * 1000);

    await setPasswordResetToken(user.uid, tokenHash, expiresAt);

    const resetUrl = `${getAuthEnv().appBaseUrl}/reset-password?token=${rawToken}`;
    await sendPasswordResetEmail({
      to: user.email,
      resetUrl,
      expiresInMinutes: TOKEN_TTL_MINUTES,
    });

    return okResponse;
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[auth/forgot-password]", err);
      return NextResponse.json({ error: "Authentication service unavailable" }, { status: 503 });
    }
    // Don't surface the email-send error to clients (would leak existence).
    // Log for ops; respond OK.
    console.error("[auth/forgot-password] send failed", err);
    return okResponse;
  }
}
