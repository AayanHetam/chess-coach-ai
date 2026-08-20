import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { assertAuthSecrets } from "@/env";
import { signupSchema, firstZodError } from "@/lib/auth/validation";
import { setSessionCookieOnResponse } from "@/lib/auth/session";
import { createUser, toSafe, UserError } from "@/lib/server/users";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";
import { isAllowlistedIntern } from "@/lib/intern/allowlist";
import { isDashboardAdminEmail } from "@/lib/auth/isAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    assertAuthSecrets({ needsSession: true, needsAdmin: true });
  } catch (err) {
    console.error("[auth/signup]", err);
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
    input = signupSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: firstZodError(err) }, { status: 400 });
    }
    throw err;
  }

  try {
    const user = await createUser({
      email: input.email,
      password: input.password,
      displayName: input.displayName,
      ageAffirmed: input.ageAffirmed,
      termsAccepted: input.termsAccepted,
      handle: input.handle,
      emailOptIn: input.emailOptIn,
    });

    const isIntern = await isAllowlistedIntern(user.email);
    const isAdmin = isDashboardAdminEmail(user.email);

    const safe = toSafe(user);
    const response = NextResponse.json({ user: safe }, { status: 201 });
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
    if (err instanceof UserError && err.code === "email_taken") {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 409 }
      );
    }
    // 409 for a lost race on the handle, 400 for one that could never be
    // valid. Both are the user's to fix, and neither is a server fault — a
    // 500 here would send them to "try again later" for something retrying
    // will never resolve.
    if (err instanceof UserError && err.code === "handle_taken") {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 409 }
      );
    }
    if (err instanceof UserError && err.code === "handle_invalid") {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 400 }
      );
    }
    if (err instanceof AdminConfigError) {
      console.error("[auth/signup]", err);
      return NextResponse.json(
        { error: "Authentication service unavailable" },
        { status: 503 }
      );
    }
    console.error("[auth/signup] unexpected", err);
    return NextResponse.json({ error: "Sign-up failed." }, { status: 500 });
  }
}
