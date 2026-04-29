/**
 * Client-side wrappers for the chats API. Mirrors firestoreGames.ts.
 * All persistence is gated server-side on `requireSession()`; callers
 * should still skip these calls for anonymous users to avoid 401 noise.
 */

export interface ChatGameRef {
  firestoreId?: string;
  pgn?: string;
  fen?: string;
  opponent?: string;
  result?: string;
}

export interface ChatRecord {
  firestoreId: string;
  title: string;
  coachId: string | null;
  gameRef: ChatGameRef | null;
  messageCount: number;
  preview: string;
  titleSource: "manual" | "llm" | "pgn" | "fallback";
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ChatMessageRecord {
  firestoreId: string;
  role: "user" | "assistant";
  content: string;
  createdAt?: unknown;
  feedback?: "positive" | "negative";
}

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Request failed (${res.status}): ${text || res.statusText}`);
  }
  return (await res.json()) as T;
}

export async function listChats(): Promise<ChatRecord[]> {
  const res = await fetch("/api/chats", { credentials: "include" });
  if (res.status === 401) return [];
  const data = await asJson<{ chats: ChatRecord[] }>(res);
  return data.chats;
}

export async function getChat(
  chatId: string
): Promise<{ chat: ChatRecord; messages: ChatMessageRecord[] }> {
  const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`, {
    credentials: "include",
  });
  return asJson(res);
}

export async function createChat(input: {
  title?: string;
  coachId?: string;
  gameRef?: ChatGameRef | null;
}): Promise<string> {
  const res = await fetch("/api/chats", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await asJson<{ firestoreId: string }>(res);
  return data.firestoreId;
}

export async function appendMessage(
  chatId: string,
  message: { role: "user" | "assistant"; content: string }
): Promise<void> {
  const res = await fetch(
    `/api/chats/${encodeURIComponent(chatId)}/messages`,
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    }
  );
  await asJson(res);
}

export async function renameChat(
  chatId: string,
  title: string
): Promise<void> {
  const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title, titleSource: "manual" }),
  });
  await asJson(res);
}

export async function deleteChat(chatId: string): Promise<void> {
  const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`, {
    method: "DELETE",
    credentials: "include",
  });
  await asJson(res);
}

export async function generateChatTitle(
  chatId: string
): Promise<{ title: string; titleSource: ChatRecord["titleSource"] }> {
  const res = await fetch(
    `/api/chats/${encodeURIComponent(chatId)}/title`,
    { method: "POST", credentials: "include" }
  );
  return asJson(res);
}

/**
 * Convert Firestore admin Timestamp ({ _seconds, _nanoseconds }) or ISO string
 * into a number of millis since epoch. Returns 0 if unparseable.
 */
export function chatTimestampMs(value: unknown): number {
  if (!value) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const t = Date.parse(value);
    return Number.isFinite(t) ? t : 0;
  }
  if (typeof value === "object") {
    const v = value as { _seconds?: number; seconds?: number };
    const s = v._seconds ?? v.seconds;
    if (typeof s === "number") return s * 1000;
  }
  return 0;
}
