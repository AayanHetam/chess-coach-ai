import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "./firebaseAdmin";
import { withFirestoreTimeout } from "./withFirestoreTimeout";

const COLLECTION = "users";
const BCRYPT_COST = 12;

export type CoachTone = "friendly" | "strict" | "masti";
export type PlayingStyle = "tactical" | "positional" | "balanced";
export type StudyGoal = "tactics" | "endgames" | "openings" | "time-management";
export type BoardTheme = "classic" | "wood" | "neon";
export type PieceSet = "default" | "merida" | "alpha";

export type StoredUser = {
  uid: string;
  email: string;
  emailVerified?: boolean;
  passwordHash?: string;
  googleId?: string;

  displayName?: string;
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

export async function getUserById(uid: string): Promise<StoredUser | null> {
  const db = await getAdminFirestore();
  const snap = await withFirestoreTimeout(
    db.collection(COLLECTION).doc(uid).get(),
    `users.getUserById(${uid})`,
  );
  if (!snap.exists) return null;
  return { uid: snap.id, ...(snap.data() as Omit<StoredUser, "uid">) };
}

export async function getUserByEmail(email: string): Promise<StoredUser | null> {
  const db = await getAdminFirestore();
  const snap = await db
    .collection(COLLECTION)
    .where("email", "==", normalizeEmail(email))
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { uid: doc.id, ...(doc.data() as Omit<StoredUser, "uid">) };
}

export async function getUserByGoogleId(googleId: string): Promise<StoredUser | null> {
  const db = await getAdminFirestore();
  const snap = await db
    .collection(COLLECTION)
    .where("googleId", "==", googleId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { uid: doc.id, ...(doc.data() as Omit<StoredUser, "uid">) };
}

export async function getUserByPasswordResetHash(hash: string): Promise<StoredUser | null> {
  const db = await getAdminFirestore();
  const snap = await db
    .collection(COLLECTION)
    .where("passwordResetHash", "==", hash)
    .limit(1)
    .get();
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
};

export async function createUser(input: CreateUserInput): Promise<StoredUser> {
  const email = normalizeEmail(input.email);
  const existing = await getUserByEmail(email);
  if (existing) {
    throw new UserError("email_taken", "An account with this email already exists.");
  }

  const uid = randomUUID();
  const passwordHash = input.password ? await bcrypt.hash(input.password, BCRYPT_COST) : undefined;

  const doc: Record<string, unknown> = {
    email,
    emailVerified: input.emailVerified ?? false,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    lastLoginAt: FieldValue.serverTimestamp(),
  };
  if (passwordHash) doc.passwordHash = passwordHash;
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
    await bcrypt.compare(password, "$2a$12$invalidinvalidinvalidinvalidinvalidinvalidinvalid");
    return null;
  }
  const ok = await bcrypt.compare(password, user.passwordHash);
  return ok ? user : null;
}

export type UpdateUserPatch = Partial<
  Pick<
    StoredUser,
    | "displayName"
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
    | "boardTheme"
    | "pieceSet"
    | "timezone"
    | "googleId"
    | "emailVerified"
  >
>;

export async function updateUser(uid: string, patch: UpdateUserPatch): Promise<StoredUser> {
  const db = await getAdminFirestore();
  const cleaned: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
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

export async function setPassword(uid: string, password: string): Promise<void> {
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
  await db.collection(COLLECTION).doc(uid).update({
    passwordResetHash: tokenHash,
    passwordResetExpiresAt: Timestamp.fromDate(expiresAt),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export class UserError extends Error {
  constructor(
    public code: "email_taken" | "not_found" | "invalid_credentials" | "weak_password",
    message: string
  ) {
    super(message);
    this.name = "UserError";
  }
}

export { toSafe };
