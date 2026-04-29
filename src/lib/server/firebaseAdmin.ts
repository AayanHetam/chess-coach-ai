import type { App } from "firebase-admin/app";
import type { Auth } from "firebase-admin/auth";
import type { Firestore } from "firebase-admin/firestore";
import { getAuthEnv } from "@/env";

/**
 * Lazy, cached initialization of the Firebase Admin SDK. Server-only.
 * Reaches firestore.googleapis.com / identitytoolkit.googleapis.com
 * server-to-server, so school-WiFi domain blocks of *.firebaseapp.com
 * do not affect this path.
 */

let cachedApp: App | null = null;
let cachedAuth: Auth | null = null;
let cachedDb: Firestore | null = null;

export class AdminConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminConfigError";
  }
}

async function getAdminApp(): Promise<App> {
  if (cachedApp) return cachedApp;

  const { projectId, clientEmail, privateKey } = getAuthEnv().firebase;
  if (!projectId || !clientEmail || !privateKey) {
    throw new AdminConfigError(
      "Firebase Admin credentials missing. Set FIREBASE_PROJECT_ID, " +
        "FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in your env."
    );
  }

  const { initializeApp, getApps, cert } = await import("firebase-admin/app");
  cachedApp =
    getApps()[0] ??
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  return cachedApp;
}

export async function getAdminAuth(): Promise<Auth> {
  if (cachedAuth) return cachedAuth;
  const app = await getAdminApp();
  const { getAuth } = await import("firebase-admin/auth");
  cachedAuth = getAuth(app);
  return cachedAuth;
}

export async function getAdminFirestore(): Promise<Firestore> {
  if (cachedDb) return cachedDb;
  const app = await getAdminApp();
  const { getFirestore } = await import("firebase-admin/firestore");
  cachedDb = getFirestore(app);
  return cachedDb;
}

export function __resetAdminCacheForTests() {
  cachedApp = null;
  cachedAuth = null;
  cachedDb = null;
}
