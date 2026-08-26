import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "./firebaseAdmin";
import { withFirestoreTimeout } from "./withFirestoreTimeout";
import { getUidByHandle, HANDLES } from "./handles";
import { checkHandle } from "../auth/handle";
import { PRIVACY_VERSION, TERMS_VERSION } from "@/lib/legal/versions";

const COLLECTION = "users";
const BCRYPT_COST = 12;

export type CoachTone = "friendly" | "strict" | "masti";
export type PlayingStyle = "tactical" | "positional" | "balanced";
export type StudyGoal =
  | "tactics"
  | "endgames"
  | "openings"
  | "middlegame"
  | "time-management";
export type BoardTheme = "classic" | "wood" | "neon";
export type PieceSet = "default" | "merida" | "alpha";

export type StoredUser = {
  uid: string;
  /**
   * OPTIONAL. Signup asks for a handle and a password; an email is offered but
   * skippable, and added later from /plan or the profile. Absent means the
   * account genuinely has none — never "not loaded".
   *
   * Consequence, stated where the field is: with no email there is nowhere to
   * send a reset link, so the password cannot be recovered. That is why the
   * signup form says so and /plan nags.
   */
  email?: string;
  emailVerified?: boolean;
  passwordHash?: string;
  googleId?: string;
  // COPPA: server timestamp of the 13+ affirmation recorded at account
  // creation (affirmation checkbox; no age or birth date ever leaves the
  // browser). Absent on accounts created before the gate shipped.
  ageAffirmedAt?: Timestamp;
  termsAcceptedAt?: Timestamp;
  termsVersion?: string;
  privacyVersion?: string;
  age13ConfirmedAt?: Timestamp;
  acceptanceMethod?: "signup-checkbox";
  /**
   * When the user ticked the OPTIONAL marketing-email checkbox at signup.
   * Absent means they did not opt in — never assume consent from absence.
   * Recorded even on email-less accounts so the preference applies if an
   * address is added later.
   */
  emailOptInAt?: Timestamp;

  displayName?: string;
  /** Public handle, in the capitalisation the user chose. */
  handle?: string;
  /** Canonical (lowercased, separator-folded) form — the uniqueness key. */
  handleLower?: string;
  photoURL?: string;
  bio?: string;

  chesscomUsername?: string;
  lichessUsername?: string;
  selfReportedRating?: number;
  primaryPlatform?: "chesscom" | "lichess";

  coachTone?: CoachTone;
  playingStyle?: PlayingStyle;
  studyGoals?: StudyGoal[];
  favoriteOpenings?: string[];

  // Onboarding-quiz output. `focusThemes` holds canonical kebab Neo4j
  // `:Theme.id` values seeded as cold-start weaknesses for the puzzle
  // recommender; `dailyTimeCommitment` is the self-reported practice budget.
  focusThemes?: string[];
  dailyTimeCommitment?: "under-10" | "10-30" | "30-plus" | "60-plus";

  // Rating pulled from the user's Lichess / Chess.com account (see
  // src/lib/rating/platformRatings.ts). `platformRating` is NORMALIZED onto the
  // common calibration scale so cross-platform comparison is fair;
  // `platformRatingRaw` is the platform's own number and is what we display.
  // Absent means "no established rating found" — never a default.
  platformRating?: number;
  platformRatingRaw?: number;
  platformRatingSource?: "lichess" | "chesscom";
  platformRatingPerf?: string;
  platformRatingFetchedAt?: number;

  // Goal-driven planning. `goalRating` is on the same calibration scale as
  // platformRating; `practiceDaysPerWeek` combines with dailyTimeCommitment to
  // give the weekly hours the improvement model needs.
  goalRating?: number;
  practiceDaysPerWeek?: number;
  /** The date the goal was projected for, so /plan can track against it. */
  goalTargetDate?: number;

  /**
   * Weaknesses MEASURED by the placement test, replaced wholesale on each run.
   *
   * Split out from `focusThemes` because the two are different kinds of data:
   * `focusThemes` is what the user SAID they want to work on and should
   * persist, while this is an OBSERVATION and must be replaceable. Unioning
   * them meant placement could add a weakness but never retract one, so a
   * theme you had since improved at stayed a training target forever.
   */
  measuredWeaknesses?: string[];

  /**
   * Where the goal projection started, and when. Stored rather than derived so
   * /plan can say "you're 3 weeks ahead" against the ORIGINAL promise instead
   * of quietly re-baselining to a softer target every time the user visits.
   */
  goalStartRating?: number;
  goalSetAt?: number;
  /**
   * Per-control targets (bullet/blitz/rapid), raw platform numbers — the
   * granular form of the goal above. Written alongside it, never instead.
   */
  perfGoals?: {
    bullet?: { start: number; goal: number };
    blitz?: { start: number; goal: number };
    rapid?: { start: number; goal: number };
  };
  // Set when the user finishes the onboarding quiz. Gates the mandatory-once
  // questionnaire (OnboardingGate) so they're never asked twice.
  onboardingCompletedAt?: number;

  // Single-rating model (see CURRICULUM plan). `selfReportedRating` above is the
  // cold-start prior. `measuredRating` is the immutable result of the most recent
  // placement test; `liveRatingSnapshot` is the periodic mirror of the client's
  // live puzzle Elo (the cross-device "current strength" the coach prompt reads).
  measuredRating?: number;
  measuredRatingConfidence?: "low" | "medium" | "high";
  measuredAt?: number;
  liveRatingSnapshot?: number;
  liveRatingSnapshotAt?: number;

  // User-set learning goals. `targetRating` is a self-chosen aspiration shown as
  // honest current→target progress (NOT a system prediction). The others are
  // effort/mastery goals that shape the daily regimen.
  goals?: {
    targetRating?: number;
    puzzlesPerDay?: number;
    masteryThemes?: string[];
  };

  // Reminder + activity state (Phase 3). Mirrored from the client's local
  // streak so the send-reminders cron can read it server-side. Reminders are
  // strictly opt-in (reminderPrefs.enabled) — that opt-in is the consent.
  lastActiveAt?: number;
  currentStreak?: number;
  streakUpdatedAt?: number;
  reminderPrefs?: {
    enabled: boolean;
    /** Preferred local send hour 0–23 (future use; cron currently fixed). */
    hour?: number;
  };
  /** Web Push subscriptions (one per device). Pruned when they expire (410). */
  pushSubscriptions?: {
    endpoint: string;
    keys: { p256dh: string; auth: string };
  }[];

  boardTheme?: BoardTheme;
  pieceSet?: PieceSet;
  timezone?: string;

  passwordResetHash?: string;
  passwordResetExpiresAt?: Timestamp;

  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  lastLoginAt?: Timestamp;
};

export type SafeUser = Omit<
  StoredUser,
  "passwordHash" | "passwordResetHash" | "passwordResetExpiresAt"
> & {
  /**
   * Whether a password is set — the HASH never leaves the server, but its
   * existence is not a secret and the client genuinely needs it: an account
   * with no password arrived through Google (so it already has an email and
   * must not be nagged for one), and the add-email form has a password field
   * that would be unanswerable.
   */
  hasPassword: boolean;
};

function toSafe(user: StoredUser): SafeUser {
  const {
    passwordHash: _ph,
    passwordResetHash: _prh,
    passwordResetExpiresAt: _pre,
    ...rest
  } = user;
  void _prh;
  void _pre;
  return { ...rest, hasPassword: Boolean(_ph) };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Auth-flow lookups (signup/signin/OAuth callback) get a longer deadline than
// the 3s default: the FIRST Firestore call on a cold serverless instance pays
// gRPC channel + token setup, measured at ~3s+ in prod — right at the default
// cap, so cold-start signups flaked with FirestoreTimeoutError. 8s still
// bounds a genuine stall well below the platform function timeout.
const AUTH_READ_TIMEOUT_MS = 8_000;

export async function getUserById(uid: string): Promise<StoredUser | null> {
  const db = await getAdminFirestore();
  const snap = await withFirestoreTimeout(
    db.collection(COLLECTION).doc(uid).get(),
    `users.getUserById(${uid})`,
    AUTH_READ_TIMEOUT_MS
  );
  if (!snap.exists) return null;
  return { uid: snap.id, ...(snap.data() as Omit<StoredUser, "uid">) };
}

export async function getUserByEmail(
  email: string
): Promise<StoredUser | null> {
  const db = await getAdminFirestore();
  const snap = await withFirestoreTimeout(
    db
      .collection(COLLECTION)
      .where("email", "==", normalizeEmail(email))
      .limit(1)
      .get(),
    `users.getUserByEmail(${normalizeEmail(email)})`,
    AUTH_READ_TIMEOUT_MS
  );
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { uid: doc.id, ...(doc.data() as Omit<StoredUser, "uid">) };
}

export async function getUserByGoogleId(
  googleId: string
): Promise<StoredUser | null> {
  const db = await getAdminFirestore();
  const snap = await withFirestoreTimeout(
    db.collection(COLLECTION).where("googleId", "==", googleId).limit(1).get(),
    `users.getUserByGoogleId(${googleId})`,
    AUTH_READ_TIMEOUT_MS
  );
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { uid: doc.id, ...(doc.data() as Omit<StoredUser, "uid">) };
}

export async function getUserByPasswordResetHash(
  hash: string
): Promise<StoredUser | null> {
  const db = await getAdminFirestore();
  const snap = await withFirestoreTimeout(
    db
      .collection(COLLECTION)
      .where("passwordResetHash", "==", hash)
      .limit(1)
      .get(),
    // Don't include the hash itself in the op label — it's a secret.
    "users.getUserByPasswordResetHash"
  );
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { uid: doc.id, ...(doc.data() as Omit<StoredUser, "uid">) };
}

export type CreateUserInput = {
  /** Optional since signup stopped requiring one. */
  email?: string;
  password?: string;
  googleId?: string;
  displayName?: string;
  photoURL?: string;
  emailVerified?: boolean;
  ageAffirmed?: boolean;
  termsAccepted?: boolean;
  /** Optional marketing-email consent — stamps emailOptInAt when true. */
  emailOptIn?: boolean;
  /**
   * Chosen at signup. Reserved in the same transaction that creates the user,
   * so an account can never exist with a handle nobody holds, and a handle can
   * never be held by an account that was never created.
   */
  handle?: string;
};

export async function createUser(input: CreateUserInput): Promise<StoredUser> {
  // No email is a legitimate account: handle + password is enough to sign up.
  // The uniqueness check only means anything when there is one to compare.
  const email = input.email ? normalizeEmail(input.email) : undefined;
  if (email) {
    const existing = await getUserByEmail(email);
    if (existing) {
      throw new UserError(
        "email_taken",
        "An account with this email already exists."
      );
    }
  }

  const uid = randomUUID();
  const passwordHash = input.password
    ? await bcrypt.hash(input.password, BCRYPT_COST)
    : undefined;

  const doc: Record<string, unknown> = {
    emailVerified: input.emailVerified ?? false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastLoginAt: FieldValue.serverTimestamp(),
  };
  // Written only when present. Firestore stores an explicit `undefined` as a
  // field, and `where("email","==",null)` would then match every email-less
  // account at once — a lookup that returns "some other user" for anyone.
  if (email) doc.email = email;
  if (passwordHash) doc.passwordHash = passwordHash;
  if (input.ageAffirmed) doc.ageAffirmedAt = FieldValue.serverTimestamp();
  if (input.ageAffirmed && input.termsAccepted) {
    doc.termsAcceptedAt = FieldValue.serverTimestamp();
    doc.termsVersion = TERMS_VERSION;
    doc.privacyVersion = PRIVACY_VERSION;
    doc.age13ConfirmedAt = FieldValue.serverTimestamp();
    doc.acceptanceMethod = "signup-checkbox";
  }
  // Only when true: absence of the field IS "did not opt in", and writing an
  // explicit false would make the two states look different when they aren't.
  if (input.emailOptIn) doc.emailOptInAt = FieldValue.serverTimestamp();
  if (input.googleId) doc.googleId = input.googleId;
  if (input.displayName) doc.displayName = input.displayName;
  if (input.photoURL) doc.photoURL = input.photoURL;

  const db = await getAdminFirestore();
  const userRef = db.collection(COLLECTION).doc(uid);

  if (input.handle !== undefined) {
    const check = checkHandle(input.handle);
    if (!check.ok || !check.canonical || !check.display) {
      throw new UserError(
        "handle_invalid",
        check.message ?? "That handle won't work."
      );
    }
    doc.handle = check.display;
    doc.handleLower = check.canonical;

    // ONE transaction for both documents. Creating the user first and claiming
    // afterwards would leave an account with no handle whenever the claim lost
    // a race — which is exactly the handle-less cohort this feature exists to
    // stop creating. Claiming first would strand a reservation pointing at a
    // user that was never written.
    //
    // `tx.create` (not set) on the reservation is what makes it a race: the
    // second of two simultaneous signups fails on a document that now exists,
    // instead of both being told yes.
    const handleRef = db.collection(HANDLES).doc(check.canonical);
    await withFirestoreTimeout(
      db.runTransaction(async (tx) => {
        const snap = await tx.get(handleRef); // read before any write
        if (snap.exists) {
          throw new UserError("handle_taken", "That handle is already taken.");
        }
        tx.create(handleRef, {
          uid,
          display: check.display,
          claimedAt: Date.now(),
        });
        tx.create(userRef, doc);
      }),
      "users.createWithHandle"
    );
  } else {
    await userRef.set(doc);
  }

  const created = await getUserById(uid);
  if (!created) throw new Error("createUser: failed to read back created user");
  return created;
}

export async function verifyPassword(
  email: string,
  password: string
): Promise<StoredUser | null> {
  const user = await getUserByEmail(email);
  // Constant-ish-time: still hash on miss so timing doesn't leak existence.
  if (!user || !user.passwordHash) {
    await bcrypt.compare(
      password,
      "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalid"
    );
    return null;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

/**
 * Sign in with EITHER a handle or an email.
 *
 * An identifier containing "@" is treated as an email; anything else is
 * resolved through the handle reservation. Both paths end in the same bcrypt
 * compare, including the dummy compare on a miss — a handle that does not
 * exist must take the same time as one that does, or the sign-in form becomes
 * an oracle for which handles are registered.
 */
/**
 * Verify a password for a KNOWN uid.
 *
 * The change-password route used to re-look-up the user by `session.email`,
 * which silently required every account to have one. It has the uid in hand;
 * the email round trip bought nothing and broke the moment signup stopped
 * asking for an address.
 */
/**
 * Attach an email to an account that has none.
 *
 * WHY A TRANSACTION AND NOT A QUERY-THEN-WRITE. Firestore has no unique
 * constraint on a field, so two people adding the same address at the same
 * moment would both pass a plain pre-check and both write it. Two users
 * sharing an email is not cosmetic: `getUserByEmail` returns the first match,
 * so sign-in-by-email and password reset would resolve to whichever document
 * the index happened to return — one person recovering into another person's
 * account. The uniqueness query runs INSIDE the transaction, which serialises
 * the two attempts.
 *
 * Only ever ADDS. Changing an existing address is a different operation with
 * its own confirmation requirements (you would have to prove control of the
 * new one), and quietly allowing it here would turn a stolen session into an
 * account takeover.
 */
export async function addEmailToUser(
  uid: string,
  rawEmail: string
): Promise<StoredUser> {
  const email = normalizeEmail(rawEmail);
  const db = await getAdminFirestore();
  const userRef = db.collection(COLLECTION).doc(uid);

  await withFirestoreTimeout(
    db.runTransaction(async (tx) => {
      // All reads first — Firestore rejects a read issued after a write.
      const [userSnap, dupeSnap] = await Promise.all([
        tx.get(userRef),
        tx.get(db.collection(COLLECTION).where("email", "==", email).limit(1)),
      ]);

      if (!userSnap.exists) {
        throw new UserError("not_found", "Account not found.");
      }
      const current = (userSnap.data() as { email?: string })?.email;
      if (current && normalizeEmail(current) !== email) {
        throw new UserError(
          "email_already_set",
          "This account already has an email. Contact support to change it."
        );
      }
      if (!dupeSnap.empty && dupeSnap.docs[0].id !== uid) {
        throw new UserError(
          "email_taken",
          "An account with this email already exists."
        );
      }

      tx.update(userRef, {
        email,
        emailVerified: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }),
    "users.addEmail"
  );

  const updated = await getUserById(uid);
  if (!updated) throw new Error("addEmailToUser: user vanished mid-update");
  return updated;
}

export async function verifyPasswordForUid(
  uid: string,
  password: string
): Promise<StoredUser | null> {
  const user = await getUserById(uid);
  if (!user || !user.passwordHash) {
    // Still hash on a miss, so timing does not distinguish "no such account"
    // from "wrong password".
    await bcrypt.compare(
      password,
      "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalid"
    );
    return null;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

export async function verifyPasswordByIdentifier(
  identifier: string,
  password: string
): Promise<StoredUser | null> {
  const id = (identifier ?? "").trim();
  if (id.includes("@")) return verifyPassword(id, password);

  const uid = await getUidByHandle(id);
  const user = uid ? await getUserById(uid) : null;
  if (!user || !user.passwordHash) {
    await bcrypt.compare(
      password,
      "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalid"
    );
    return null;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

export type UpdateUserPatch = Partial<
  Pick<
    StoredUser,
    | "displayName"
    // handle/handleLower are deliberately ABSENT: they may only be written by
    // claimHandle, inside the transaction that also writes the reservation
    // document. Allowing them through the generic patch would let a client set
    // a handle with no reservation behind it — two users could then show the
    // same name, and one could point handleLower at somebody else's handle.
    | "photoURL"
    | "bio"
    | "chesscomUsername"
    | "lichessUsername"
    | "selfReportedRating"
    | "primaryPlatform"
    | "coachTone"
    | "playingStyle"
    | "studyGoals"
    | "favoriteOpenings"
    | "focusThemes"
    | "dailyTimeCommitment"
    | "platformRating"
    | "platformRatingRaw"
    | "platformRatingSource"
    | "platformRatingPerf"
    | "platformRatingFetchedAt"
    | "goalRating"
    | "practiceDaysPerWeek"
    | "goalTargetDate"
    | "measuredWeaknesses"
    | "goalStartRating"
    | "goalSetAt"
    | "perfGoals"
    | "onboardingCompletedAt"
    | "measuredRating"
    | "measuredRatingConfidence"
    | "measuredAt"
    | "liveRatingSnapshot"
    | "liveRatingSnapshotAt"
    | "goals"
    | "lastActiveAt"
    | "currentStreak"
    | "streakUpdatedAt"
    | "reminderPrefs"
    | "pushSubscriptions"
    | "boardTheme"
    | "pieceSet"
    | "timezone"
    | "googleId"
    | "emailVerified"
  >
>;

export async function updateUser(
  uid: string,
  patch: UpdateUserPatch
): Promise<StoredUser> {
  const db = await getAdminFirestore();
  const cleaned: Record<string, unknown> = {
    updatedAt: FieldValue.serverTimestamp(),
  };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    cleaned[k] = v;
  }
  await db.collection(COLLECTION).doc(uid).update(cleaned);
  const fresh = await getUserById(uid);
  if (!fresh) throw new Error("updateUser: user disappeared mid-update");
  return fresh;
}

export async function updateLastLoginAt(uid: string): Promise<void> {
  const db = await getAdminFirestore();
  await db
    .collection(COLLECTION)
    .doc(uid)
    .update({ lastLoginAt: FieldValue.serverTimestamp() });
}

export async function setPassword(
  uid: string,
  password: string
): Promise<void> {
  const db = await getAdminFirestore();
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  await db.collection(COLLECTION).doc(uid).update({
    passwordHash,
    passwordResetHash: FieldValue.delete(),
    passwordResetExpiresAt: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function setPasswordResetToken(
  uid: string,
  tokenHash: string,
  expiresAt: Date
): Promise<void> {
  const db = await getAdminFirestore();
  await db
    .collection(COLLECTION)
    .doc(uid)
    .update({
      passwordResetHash: tokenHash,
      passwordResetExpiresAt: Timestamp.fromDate(expiresAt),
      updatedAt: FieldValue.serverTimestamp(),
    });
}

export class UserError extends Error {
  constructor(
    public code:
      | "email_taken"
      | "not_found"
      | "invalid_credentials"
      | "weak_password"
      | "handle_taken"
      | "handle_invalid"
      | "email_already_set",
    message: string
  ) {
    super(message);
    this.name = "UserError";
  }
}

export { toSafe };
