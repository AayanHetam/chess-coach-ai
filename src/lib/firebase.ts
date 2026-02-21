import { FirebaseOptions, initializeApp } from "firebase/app";
import { getAnalytics, isSupported, logEvent } from "firebase/analytics";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig: FirebaseOptions | undefined = process.env
  .NEXT_PUBLIC_FIREBASE_PROJECT_ID
  ? {
      apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
      measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    }
  : undefined;

const app = firebaseConfig ? initializeApp(firebaseConfig) : undefined;

export const auth = app ? getAuth(app) : undefined;
export const googleProvider = app ? new GoogleAuthProvider() : undefined;
export const db = app ? getFirestore(app) : undefined;
export { app };

isSupported().then((supported) => {
  if (supported && app) {
    getAnalytics(app);
  }
});

export const logAnalyticsEvent = async (
  eventName: string,
  eventParams?: Record<string, unknown>
) => {
  if (window.location.hostname === "localhost") return;

  const supported = await isSupported();
  if (!supported || !app) return;

  const analytics = getAnalytics(app);
  logEvent(analytics, eventName, eventParams);
};
