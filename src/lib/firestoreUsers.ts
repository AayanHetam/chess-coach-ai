import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  chesscomUsername?: string;
  lichessUsername?: string;
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  if (!db) throw new Error("Firestore not initialized");
  
  const userRef = doc(db, "users", uid);
  const userDoc = await getDoc(userRef);
  
  if (!userDoc.exists()) return null;
  
  return userDoc.data() as UserProfile;
}

export async function createUserProfile(user: {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
}): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");
  
  const userRef = doc(db, "users", user.uid);
  const userProfile = {
    ...user,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  } as Omit<UserProfile, "createdAt" | "updatedAt"> & {
    createdAt: ReturnType<typeof serverTimestamp>;
    updatedAt: ReturnType<typeof serverTimestamp>;
  };
  
  await setDoc(userRef, userProfile);
}

export async function updateUserProfile(
  uid: string,
  updates: Partial<Pick<UserProfile, "chesscomUsername" | "lichessUsername">>
): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");
  
  const userRef = doc(db, "users", uid);
  await updateDoc(userRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}
