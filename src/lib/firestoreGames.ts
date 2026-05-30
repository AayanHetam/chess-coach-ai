/**
 * Client-side wrappers for the cloud-games API. Same signatures as the
 * pre-migration Firebase implementation; every call now goes through
 * chessmasti.com /api/games endpoints.
 *
 * `userId` arguments are redundant since the server resolves the user
 * from the session cookie. Kept for backward compat and ignored.
 */

import { Game, SavedCoachMessage } from "@/types/game";
import { GameEval } from "@/types/eval";

export interface CloudGame extends Omit<Game, "id"> {
  firestoreId: string;
  // Server returns Firestore Timestamps as { _seconds, _nanoseconds }.
  createdAt?: unknown;
  updatedAt?: unknown;
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function getCloudGames(_userId: string): Promise<CloudGame[]> {
  void _userId;
  const res = await fetch("/api/games", { credentials: "include" });
  const data = await asJson<{ games: CloudGame[] }>(res);
  return data.games;
}

export async function addCloudGame(
  _userId: string,
  game: Omit<Game, "id">
): Promise<string> {
  void _userId;
  const res = await fetch("/api/games", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(game),
  });
  const data = await asJson<{ firestoreId: string }>(res);
  return data.firestoreId;
}

export async function updateCloudGameEval(
  _userId: string,
  firestoreId: string,
  evaluation: GameEval
): Promise<void> {
  void _userId;
  const res = await fetch(`/api/games/${encodeURIComponent(firestoreId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ eval: evaluation }),
  });
  await asJson(res);
}

/**
 * Replace the coach transcript on a cloud game record. The route handler
 * for /api/games/[id] does a `ref.update({ ...body })` so a PATCH with the
 * transcript field merges into the Firestore doc, preserving the eval and
 * everything else.
 */
export async function updateCloudGameTranscript(
  _userId: string,
  firestoreId: string,
  coachTranscript: SavedCoachMessage[]
): Promise<void> {
  void _userId;
  const res = await fetch(`/api/games/${encodeURIComponent(firestoreId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ coachTranscript }),
  });
  await asJson(res);
}

export async function deleteCloudGame(
  _userId: string,
  firestoreId: string
): Promise<void> {
  void _userId;
  const res = await fetch(`/api/games/${encodeURIComponent(firestoreId)}`, {
    method: "DELETE",
    credentials: "include",
  });
  await asJson(res);
}
