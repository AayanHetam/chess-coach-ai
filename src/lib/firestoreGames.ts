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
  const docRef = await addDoc(gamesRef, {
    ...game,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateCloudGameEval(
  userId: string,
  firestoreId: string,
  evaluation: GameEval
): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");
  const gameRef = doc(db, "users", userId, GAMES_COLLECTION, firestoreId);
  await updateDoc(gameRef, {
    eval: evaluation,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteCloudGame(
  userId: string,
  firestoreId: string
): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");
  const gameRef = doc(db, "users", userId, GAMES_COLLECTION, firestoreId);
  await deleteDoc(gameRef);
}
