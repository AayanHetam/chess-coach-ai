import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertAuthSecrets } from "@/env";
import { signinSchema, firstZodError } from "@/lib/auth/validation";
import { setSessionCookieOnResponse } from "@/lib/auth/session";
import {
  toSafe,
  updateLastLoginAt,
  verifyPasswordByIdentifier,
} from "@/lib/server/users";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";
import { isAllowlistedIntern } from "@/lib/intern/allowlist";
import { isDashboardAdminEmail } from "@/lib/auth/isAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertAuthSecrets({ needsSession: true, needsAdmin: true });
  } catch (err) {
    console.error("[auth/signin]", err);
    return NextResponse.json(
      { error: "Authentication service unavailable" },
      { status: 503 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let input;
  try {
    input = signinSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: firstZodError(err) }, { status: 400 });
    }
    throw err;
  }

  try {
    const user = await verifyPasswordByIdentifier(
      input.identifier,
      input.password
    );
    if (!user) {
      // ONE message for every failure — unknown handle, unknown email, wrong
      // password. Distinguishing them would turn this form into an oracle for
      // which handles and emails are registered, and handles are public, so
      // the guess space is small.
      return NextResponse.json(
        { error: "Invalid handle, email or password." },
        { status: 401 }
      );
    }

    await updateLastLoginAt(user.uid);

    const isIntern = await isAllowlistedIntern(user.email);
    const isAdmin = isDashboardAdminEmail(user.email);

    const safe = toSafe(user);
    const response = NextResponse.json({ user: safe });
    await setSessionCookieOnResponse(response, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.photoURL,
      isIntern,
      isAdmin,
    });
    return response;
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[auth/signin]", err);
      return NextResponse.json(
        { error: "Authentication service unavailable" },
        { status: 503 }
      );
    }
    console.error("[auth/signin] unexpected", err);
    return NextResponse.json({ error: "Sign-in failed." }, { status: 500 });
  }
}
