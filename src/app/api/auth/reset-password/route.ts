import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertAuthSecrets } from "@/env";
import { firstZodError, resetPasswordSchema } from "@/lib/auth/validation";
import { setSessionCookieOnResponse } from "@/lib/auth/session";
import {
  getUserByPasswordResetHash,
  setPassword,
  toSafe,
  updateLastLoginAt,
} from "@/lib/server/users";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertAuthSecrets({ needsSession: true, needsAdmin: true });
  } catch (err) {
    console.error("[auth/reset-password]", err);
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
    input = resetPasswordSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: firstZodError(err) }, { status: 400 });
    }
    throw err;
  }

  try {
    const tokenHash = createHash("sha256").update(input.token).digest("hex");
    const user = await getUserByPasswordResetHash(tokenHash);
    if (!user || !user.passwordResetExpiresAt) {
      return NextResponse.json(
        { error: "This reset link is invalid or has already been used." },
        { status: 400 }
      );
    }
    if (user.passwordResetExpiresAt.toMillis() < Date.now()) {
      return NextResponse.json(
        { error: "This reset link has expired. Request a new one." },
        { status: 400 }
      );
    }

    await setPassword(user.uid, input.newPassword);
    await updateLastLoginAt(user.uid);

    const response = NextResponse.json({ user: toSafe(user) });
    await setSessionCookieOnResponse(response, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.photoURL,
    });
    return response;
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[auth/reset-password]", err);
      return NextResponse.json({ error: "Authentication service unavailable" }, { status: 503 });
    }
    console.error("[auth/reset-password] unexpected", err);
    return NextResponse.json({ error: "Password reset failed." }, { status: 500 });
  }
}
