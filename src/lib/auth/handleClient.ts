/**
 * Browser-side calls to /api/profile/handle.
 *
 * Two callers claim a handle now — the HandleCard on /profile, and the
 * post-signup flush that finishes what the onboarding quiz started — so the
 * request shape and the outcomes live here rather than being written twice.
 *
 * Both endpoints are session-gated on purpose (see the route): availability is
 * not a public oracle for enumerating who exists, and the claim is a
 * transaction. The quiz therefore validates FORMAT only while the visitor is
 * signed out (checkHandle in ./handle, which is pure), and the claim below is
 * what actually settles it.
 */

export type HandleClaimStatus =
  | "ok"
  /** Already theirs — claiming the same handle twice is not a failure. */
  | "unchanged"
  /** Someone else got there first, between the check and the submit. */
  | "taken"
  | "invalid"
  /** Not signed in, or the request never landed. */
  | "unavailable";

export interface HandleClaimResult {
  status: HandleClaimStatus;
  handle?: string;
  message?: string;
}

export async function postHandleClaim(
  handle: string
): Promise<HandleClaimResult> {
  try {
    const res = await fetch("/api/profile/handle", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ handle }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      status?: string;
      handle?: string;
      error?: string;
    };
    if (res.ok) {
      return {
        status: data.status === "unchanged" ? "unchanged" : "ok",
        handle: data.handle,
      };
    }
    // 409 means somebody claimed it between the check and the submit. The
    // availability hint was always advisory; this is where it is settled.
    if (res.status === 409) {
      return {
        status: "taken",
        message: data.error ?? "That handle is taken.",
      };
    }
    if (res.status === 400) {
      return {
        status: "invalid",
        message: data.error ?? "Could not claim that handle.",
      };
    }
    return { status: "unavailable", message: data.error };
  } catch {
    return {
      status: "unavailable",
      message: "Could not reach the server. Try again.",
    };
  }
}

export interface HandleAvailability {
  /** Undefined when we could not find out — render it as unknown, never free. */
  available?: boolean;
  message?: string;
}

export async function fetchHandleAvailability(
  handle: string
): Promise<HandleAvailability> {
  try {
    const res = await fetch(
      `/api/profile/handle?handle=${encodeURIComponent(handle)}`,
      { credentials: "include" }
    );
    if (!res.ok) return {};
    const data = (await res.json()) as {
      available?: boolean;
      message?: string;
    };
    return { available: data.available, message: data.message };
  } catch {
    // Unknown, not "free" — claiming is the real gate anyway, and showing a
    // green tick we cannot back up would be a small lie.
    return {};
  }
}
