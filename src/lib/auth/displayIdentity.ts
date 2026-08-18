/**
 * What we call the user — resolved in exactly one place.
 *
 * A handle is the name the user CHOSE for themselves, so it outranks
 * `displayName` (which on the Google path is their real, legal-ish name, often
 * with a surname we should not be broadcasting) and the email local part
 * (which leaks an address into any screenshot).
 *
 * One resolver rather than four: the greeting on /plan, the account menu, the
 * puzzle rail and the auth dialog each rolled their own
 * `displayName || email.split("@")[0] || "You"` chain. Four chains is how a
 * handle ends up shown in three places and missing from the fourth.
 */

export interface AddressableUser {
  handle?: string;
  displayName?: string;
  email?: string;
}

/** Last resort, when we know nothing at all about who this is. */
export const FALLBACK_NAME = "Chess Player";

/**
 * The name to address this user by.
 *
 * Never returns an empty string: a blank greeting ("Welcome back,") reads as a
 * bug, and every caller here is rendering into a sentence.
 */
export function addressAs(
  user: AddressableUser | null | undefined,
  fallback: string = FALLBACK_NAME
): string {
  if (!user) return fallback;
  const handle = user.handle?.trim();
  if (handle) return handle;
  const name = user.displayName?.trim();
  if (name) return name;
  const local = user.email?.trim().split("@")[0]?.trim();
  if (local) return local;
  return fallback;
}

/**
 * Just the first word — for "Welcome, Ana!" where a full "Ana Maria Sousa"
 * would wrap. Handles have no spaces, so this is a no-op for them by design.
 *
 * The fallback is returned WHOLE: splitting the default yields "Welcome,
 * Chess!", which is worse than the generic greeting it was meant to be.
 *
 * `fallback` is per-surface because the right last resort differs: /plan says
 * "Welcome back, there", while an account menu needs a noun.
 */
export function firstNameOf(
  user: AddressableUser | null | undefined,
  fallback: string = FALLBACK_NAME
): string {
  const name = addressAs(user, fallback);
  if (name === fallback) return fallback;
  return name.split(/\s+/)[0] || fallback;
}

/**
 * The single letter for an avatar chip. Uppercased, and never a space or an
 * empty string — an empty avatar circle looks like a failed image load.
 */
export function avatarInitial(
  user: AddressableUser | null | undefined
): string {
  const ch = addressAs(user).trim().charAt(0).toUpperCase();
  return ch || FALLBACK_NAME.charAt(0);
}
