import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { requireSession } from "@/lib/auth/session";
import {
  getAdminFirestore,
  AdminConfigError,
} from "@/lib/server/firebaseAdmin";
import { callLLM, toSafeLLMError } from "@/lib/llmProvider";
import { aiRefusal } from "@/lib/coach/aiGate";

export const runtime = "nodejs";

const SUBCOLLECTION = "chats";
const MESSAGES = "messages";
const MAX_TITLE_LEN = 50;

type RouteContext = { params: Promise<{ id: string }> };

function clean(t: string): string {
  return t
    .replace(/^["'`]+|["'`]+$/g, "")
    .trim()
    .slice(0, MAX_TITLE_LEN);
}

/**
 * Generate a short title for an existing chat. Chooses one of:
 *   - LLM (preferred): summarize first user + assistant turns into ≤50 chars
 *   - PGN-based fallback: "vs {opponent} ({result})" from gameRef
 *   - Date fallback: "Chat — MMM d"
 *
 * Auto-sets `titleSource`. Skips if the chat already has a manual title.
 */
export async function POST(_request: Request, { params }: RouteContext) {
  // AI is switched off on purpose (see lib/coach/aiAvailability). Refuse
  // BEFORE any work, auth or spend, and with a code that says "off", not
  // "broken" — the difference decides whether the user retries forever.
  { const refusal = await aiRefusal(); if (refusal) return refusal; }
  const guard = await requireSession();
  if ("response" in guard) return guard.response;

  const { id } = await params;
  if (!id)
    return NextResponse.json({ error: "Missing chat id." }, { status: 400 });

  try {
    const db = await getAdminFirestore();
    const chatRef = db
      .collection("users")
      .doc(guard.session.uid)
      .collection(SUBCOLLECTION)
      .doc(id);
    const chatSnap = await chatRef.get();
    if (!chatSnap.exists) {
      return NextResponse.json({ error: "Chat not found." }, { status: 404 });
    }
    const chat = chatSnap.data() ?? {};

    // Don't overwrite a manually-edited title.
    if (chat.titleSource === "manual") {
      return NextResponse.json({ title: chat.title, titleSource: "manual" });
    }

    // Pull first 4 messages for the LLM call.
    const msgsSnap = await chatRef
      .collection(MESSAGES)
      .orderBy("createdAt", "asc")
      .limit(4)
      .get();
    const turns = msgsSnap.docs.map(
      (d) => d.data() as { role: string; content: string }
    );

    let title: string | null = null;
    let source: "llm" | "pgn" | "fallback" = "fallback";

    // 1. LLM
    if (turns.length >= 2) {
      const condensed = turns
        .map((t) => `${t.role.toUpperCase()}: ${t.content.slice(0, 400)}`)
        .join("\n");
      try {
        const result = await callLLM({
          tier: "fast",
          system:
            "Summarize a chess-coaching chat as a short, descriptive title (4–7 words, no quotes, no trailing period). " +
            "Focus on the chess concept or game being discussed.",
          messages: [
            {
              role: "user",
              content: `Title this conversation:\n\n${condensed}`,
            },
          ],
          temperature: 0.3,
          maxTokens: 30,
        });
        const t = clean(result.content);
        if (t.length >= 3) {
          title = t;
          source = "llm";
        }
      } catch (err) {
        // Fall through to pgn/date fallback.
        const e = toSafeLLMError(err);
        console.warn("[chats title] LLM failed:", e.message);
      }
    }

    // 2. PGN headers
    if (!title) {
      const gameRef = chat.gameRef as
        | { opponent?: string; result?: string }
        | null
        | undefined;
      if (gameRef?.opponent) {
        title = clean(
          `vs ${gameRef.opponent}${gameRef.result ? ` (${gameRef.result})` : ""}`
        );
        source = "pgn";
      }
    }

    // 3. Date fallback
    if (!title) {
      const d = new Date();
      const month = d.toLocaleString("en-US", { month: "short" });
      title = `Chat — ${month} ${d.getDate()}`;
      source = "fallback";
    }

    await chatRef.update({
      title,
      titleSource: source,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ title, titleSource: source });
  } catch (err) {
    if (err instanceof AdminConfigError) {
      console.error("[chats title POST]", err);
      return NextResponse.json(
        { error: "Service unavailable" },
        { status: 503 }
      );
    }
    console.error("[chats title POST] unexpected", err);
    return NextResponse.json(
      { error: "Failed to title chat." },
      { status: 500 }
    );
  }
}
