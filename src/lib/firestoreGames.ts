import {
  collection,
  doc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  orderBy,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Game } from "@/types/game";
import { GameEval } from "@/types/eval";

const GAMES_COLLECTION = "games";

// Recursively strip undefined values — Firestore rejects them
function stripUndefined(obj: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      result[key] = value.map((item) =>
        item !== null && typeof item === "object" && !(item instanceof Timestamp)
          ? stripUndefined(item)
          : item
      );
    } else if (value !== null && typeof value === "object" && !(value instanceof Timestamp)) {
      result[key] = stripUndefined(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

function getUserGamesRef(userId: string) {
  if (!db) throw new Error("Firestore not initialized");
  return collection(db, "users", userId, GAMES_COLLECTION);
}

export interface CloudGame extends Omit<Game, "id"> {
  firestoreId: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export async function getCloudGames(userId: string): Promise<CloudGame[]> {
  const gamesRef = getUserGamesRef(userId);
  const q = query(gamesRef, orderBy("createdAt", "desc"));
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => ({
    ...doc.data(),
    firestoreId: doc.id,
  })) as CloudGame[];
}

export async function addCloudGame(
  userId: string,
  game: Omit<Game, "id">
): Promise<string> {
  const gamesRef = getUserGamesRef(userId);
  const docRef = await addDoc(gamesRef, stripUndefined({
    ...game,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }));
  return docRef.id;
}

export async function updateCloudGameEval(
  userId: string,
  firestoreId: string,
  evaluation: GameEval
): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");
  const gameRef = doc(db, "users", userId, GAMES_COLLECTION, firestoreId);
  await updateDoc(gameRef, stripUndefined({
    eval: evaluation,
    updatedAt: serverTimestamp(),
  }));
}

export async function deleteCloudGame(
  userId: string,
  firestoreId: string
): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");
  const gameRef = doc(db, "users", userId, GAMES_COLLECTION, firestoreId);
  await deleteDoc(gameRef);
}
