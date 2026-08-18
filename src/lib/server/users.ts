import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "./firebaseAdmin";
import { withFirestoreTimeout } from "./withFirestoreTimeout";
import { getUidByHandle } from "./handles";
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
  email: string;
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
  dailyTimeCommitment?: "under-10" | "10-30" | "30-plus";

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
>;

function toSafe(user: StoredUser): SafeUser {
  const {
    passwordHash: _ph,
    passwordResetHash: _prh,
    passwordResetExpiresAt: _pre,
    ...rest
  } = user;
  void _ph;
  void _prh;
  void _pre;
  return rest;
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
  email: string;
  password?: string;
  googleId?: string;
  displayName?: string;
  photoURL?: string;
  emailVerified?: boolean;
  ageAffirmed?: boolean;
  termsAccepted?: boolean;
};

export async function createUser(input: CreateUserInput): Promise<StoredUser> {
  const email = normalizeEmail(input.email);
  const existing = await getUserByEmail(email);
  if (existing) {
    throw new UserError(
      "email_taken",
      "An account with this email already exists."
    );
  }

  const uid = randomUUID();
  const passwordHash = input.password
    ? await bcrypt.hash(input.password, BCRYPT_COST)
    : undefined;

  const doc: Record<string, unknown> = {
    email,
    emailVerified: input.emailVerified ?? false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastLoginAt: FieldValue.serverTimestamp(),
  };
  if (passwordHash) doc.passwordHash = passwordHash;
  if (input.ageAffirmed) doc.ageAffirmedAt = FieldValue.serverTimestamp();
  if (input.ageAffirmed && input.termsAccepted) {
    doc.termsAcceptedAt = FieldValue.serverTimestamp();
    doc.termsVersion = TERMS_VERSION;
    doc.privacyVersion = PRIVACY_VERSION;
    doc.age13ConfirmedAt = FieldValue.serverTimestamp();
    doc.acceptanceMethod = "signup-checkbox";
  }
  if (input.googleId) doc.googleId = input.googleId;
  if (input.displayName) doc.displayName = input.displayName;
  if (input.photoURL) doc.photoURL = input.photoURL;

  const db = await getAdminFirestore();
  await db.collection(COLLECTION).doc(uid).set(doc);

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
      | "weak_password",
    message: string
  ) {
    super(message);
    this.name = "UserError";
  }
}

export { toSafe };
