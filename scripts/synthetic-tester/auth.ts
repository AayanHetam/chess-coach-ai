import { SignJWT } from "jose";

export type TestSession = { uid: string; email: string };

export async function mintSessionCookie(
  sessionSecret: string,
  session: TestSession,
  expiresIn = "2h"
): Promise<string> {
  if (!sessionSecret || sessionSecret.length < 32) {
    throw new Error("SESSION_SECRET missing or <32 chars");
  }
  const key = new TextEncoder().encode(sessionSecret);
  const token = await new SignJWT({ uid: session.uid, email: session.email })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(key);
  return `cm_session=${token}`;
}

export function makeRunUid(runId: string): string {
  return `synthtest-${runId}`;
}
