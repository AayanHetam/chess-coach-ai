/**
 * Add an email to an account that signed up without one.
 *
 *   POST /api/profile/email { email, password }  → attach it
 *
 * Session-gated AND password-gated. The session alone is not enough: a stolen
 * cookie that could attach an attacker's address would then be able to send
 * itself a password reset, which turns session theft into permanent account
 * takeover. Re-proving the password costs the real owner one field they typed
 * minutes ago and closes that path.
 *
 * Google accounts already have an email, so the password requirement never
 * strands anyone: an account with no password is an account that arrived
 * through OAuth, which means it arrived with an address.
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { requireSession } from "@/lib/auth/session";
import { addEmailSchema, firstZodError } from "@/lib/auth/validation";
import {
  addEmailToUser,
  verifyPasswordForUid,
  toSafe,
  UserError,
} from "@/lib/server/users";
import { AdminConfigError } from "@/lib/server/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  let input;
  try {
    input = addEmailSchema.parse(body);
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json({ error: firstZodError(err) }, { status: 400 });
    }
    throw err;
  }

  try {
    const verified = await verifyPasswordForUid(
      guard.session.uid,
      input.password
    );
    if (!verified) {
      return NextResponse.json(
        { error: "That password isn't right." },
        { status: 401 }
      );
    }

    const user = await addEmailToUser(guard.session.uid, input.email);
    return NextResponse.json({ user: toSafe(user) });
  } catch (err) {
    if (err instanceof UserError && err.code === "email_taken") {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 409 }
      );
    }
    if (err instanceof UserError && err.code === "email_already_set") {
      return NextResponse.json(
        { error: err.message, code: err.code },
        { status: 409 }
      );
    }
    if (err instanceof AdminConfigError) {
      console.error("[profile/email]", err);
      return NextResponse.json(
        { error: "Service unavailable." },
        { status: 503 }
      );
    }
    console.error("[profile/email] unexpected", err);
    return NextResponse.json(
      { error: "Could not save that email." },
      { status: 500 }
    );
  }
}
