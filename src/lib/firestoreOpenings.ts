import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit as firestoreLimit,
  startAfter,
  serverTimestamp,
  writeBatch,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const OPENINGS_COLLECTION = "openings";

export interface OpeningDocument {
  name: string;
  fen: string | null;
  eco: string | null;
  pgn: string | null;
  createdAt?: unknown;
  updatedAt?: unknown;
}

function getOpeningsRef() {
  if (!db) throw new Error("Firestore not initialized");
  return collection(db, OPENINGS_COLLECTION);
}

// ── Bulk loading ─────────────────────────────────────────────────────────────

/**
 * Batch-write openings JSON to Firestore in chunks of 500.
 * Uses opening name as the document ID for deduplication.
 */
export async function bulkLoadOpenings(
  openings: Array<{ name: string; fen: string | null; eco: string | null; pgn: string | null }>
): Promise<{ loaded: number; batches: number }> {
  if (!db) throw new Error("Firestore not initialized");

  const BATCH_SIZE = 500;
  let loaded = 0;
  let batchCount = 0;

  for (let i = 0; i < openings.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    const chunk = openings.slice(i, i + BATCH_SIZE);

    for (const opening of chunk) {
      const docId = opening.name.replace(/[/\\]/g, "_");
      const docRef = doc(db, OPENINGS_COLLECTION, docId);
      batch.set(docRef, {
        name: opening.name,
        fen: opening.fen,
        eco: opening.eco,
        pgn: opening.pgn,
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    loaded += chunk.length;
    batchCount++;
  }

  return { loaded, batches: batchCount };
}

// ── Read operations ──────────────────────────────────────────────────────────

/** Get all openings ordered by name */
export async function getAllOpenings(): Promise<OpeningDocument[]> {
  const ref = getOpeningsRef();
  const q = query(ref, orderBy("name"));
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as OpeningDocument);
}

/** Get openings with pagination */
export async function getOpeningsPaginated(
  pageSize: number,
  lastDoc?: QueryDocumentSnapshot
): Promise<{ openings: OpeningDocument[]; lastDoc: QueryDocumentSnapshot | null }> {
  const ref = getOpeningsRef();
  let q = lastDoc
    ? query(ref, orderBy("name"), startAfter(lastDoc), firestoreLimit(pageSize))
    : query(ref, orderBy("name"), firestoreLimit(pageSize));

  const snapshot = await getDocs(q);
  const openings = snapshot.docs.map((d) => d.data() as OpeningDocument);
  const last = snapshot.docs.length > 0 ? snapshot.docs[snapshot.docs.length - 1] : null;

  return { openings, lastDoc: last };
}

/** Get a single opening by exact name */
export async function getOpeningByName(name: string): Promise<OpeningDocument | null> {
  if (!db) throw new Error("Firestore not initialized");
  const docId = name.replace(/[/\\]/g, "_");
  const docRef = doc(db, OPENINGS_COLLECTION, docId);
  const snapshot = await getDoc(docRef);
  return snapshot.exists() ? (snapshot.data() as OpeningDocument) : null;
}

/** Search openings by name prefix (case-sensitive due to Firestore limitations) */
export async function searchOpeningsByName(
  prefix: string,
  maxResults: number = 20
): Promise<OpeningDocument[]> {
  const ref = getOpeningsRef();
  const end = prefix.slice(0, -1) + String.fromCharCode(prefix.charCodeAt(prefix.length - 1) + 1);
  const q = query(
    ref,
    where("name", ">=", prefix),
    where("name", "<", end),
    firestoreLimit(maxResults)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as OpeningDocument);
}

/** Get openings by ECO prefix (e.g., "B" for all semi-open, "B20" for Sicilian family) */
export async function getOpeningsByEcoPrefix(
  ecoPrefix: string,
  maxResults: number = 100
): Promise<OpeningDocument[]> {
  const ref = getOpeningsRef();
  const end = ecoPrefix.slice(0, -1) + String.fromCharCode(ecoPrefix.charCodeAt(ecoPrefix.length - 1) + 1);
  const q = query(
    ref,
    where("eco", ">=", ecoPrefix),
    where("eco", "<", end),
    firestoreLimit(maxResults)
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) => d.data() as OpeningDocument);
}

// ── CRUD operations ──────────────────────────────────────────────────────────

export async function addOpening(opening: Omit<OpeningDocument, "createdAt" | "updatedAt">): Promise<string> {
  const ref = getOpeningsRef();
  const docRef = await addDoc(ref, {
    ...opening,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

export async function updateOpening(
  name: string,
  updates: Partial<Omit<OpeningDocument, "createdAt" | "updatedAt">>
): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");
  const docId = name.replace(/[/\\]/g, "_");
  const docRef = doc(db, OPENINGS_COLLECTION, docId);
  await updateDoc(docRef, {
    ...updates,
    updatedAt: serverTimestamp(),
  });
}

export async function deleteOpening(name: string): Promise<void> {
  if (!db) throw new Error("Firestore not initialized");
  const docId = name.replace(/[/\\]/g, "_");
  const docRef = doc(db, OPENINGS_COLLECTION, docId);
  await deleteDoc(docRef);
}
