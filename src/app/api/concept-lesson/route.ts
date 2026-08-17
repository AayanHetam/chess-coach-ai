import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { callLLM, LLMError, getProviderStatus } from "@/lib/llmProvider";
import { requireSession } from "@/lib/auth/session";
import { allSyllabusThemes } from "@/lib/curriculum/syllabus";
import { QUIZ_FOCUS_THEME_IDS } from "@/components/onboarding/quizThemes";

/**
 * Concept micro-lesson (Phase 5 of the learning engine).
 *
 * A cheap Haiku call that explains one tactical concept at the user's level —
 * the AI coach as teacher's voice on top of the curriculum, NOT bound to a
 * specific game. Modeled on classify-intent. Validated against the curriculum
 * theme set and cached in-memory by (themeId, tier) since lessons are stable.
 */

const KNOWN_THEMES = new Set<string>([
  ...allSyllabusThemes(),
  ...QUIZ_FOCUS_THEME_IDS,
]);

const schema = z.object({
  themeId: z.string().min(1).max(60),
  userRating: z.number().int().min(0).max(4000).optional(),
});

type SkillTier = "beginner" | "intermediate" | "advanced";

export interface ConceptLesson {
  what: string;
  spot: string;
  cue: string;
}

function tierFor(rating?: number): SkillTier {
  const r = typeof rating === "number" ? rating : 1200;
  if (r < 1000) return "beginner";
  if (r < 1600) return "intermediate";
  return "advanced";
}

function humanize(id: string): string {
  return id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const SYSTEM_PROMPT = `You are a friendly, expert chess coach. Explain ONE tactical/strategic concept to a player at the given skill level. Be concrete, encouraging, and brief.

Adapt to the skill level:
- beginner: plain English, no jargon, one clear idea.
- intermediate: introduce the term with brief context; mention a typical setup.
- advanced: standard terminology, a sharper nuance or common mistake.

Output STRICT JSON only — no prose, no markdown fences:
{"what": "1-2 sentences: what the concept is", "spot": "1-2 sentences: how to spot it or set it up at the board", "cue": "one short memorable cue or checklist line"}`;

// Module-level cache (lessons are deterministic enough to reuse).
const cache = new Map<string, ConceptLesson>();

function parseLesson(raw: string): ConceptLesson | null {
  const cleaned = raw
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    const p = JSON.parse(match[0]) as Partial<ConceptLesson>;
    if (
      typeof p.what !== "string" ||
      typeof p.spot !== "string" ||
      typeof p.cue !== "string"
    ) {
      return null;
    }
    return { what: p.what.trim(), spot: p.spot.trim(), cue: p.cue.trim() };
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;

  const status = getProviderStatus();
  if (!status.anthropic.keyValid && !status.openai.keyValid) {
    return NextResponse.json(
      { error: "No LLM provider configured" },
      { status: 500 }
    );
  }

  let parsed;
  try {
    parsed = schema.parse(await request.json());
  } catch (err) {
    return NextResponse.json(
      {
        error: "Invalid request",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 400 }
    );
  }

  const { themeId } = parsed;
  if (!KNOWN_THEMES.has(themeId)) {
    return NextResponse.json(
      { error: `Unknown theme: ${themeId}` },
      { status: 400 }
    );
  }
  const tier = tierFor(parsed.userRating);

  const key = `${themeId}:${tier}`;
  const cached = cache.get(key);
  if (cached) {
    return NextResponse.json({ themeId, tier, lesson: cached, cached: true });
  }

  let llmResult;
  try {
    llmResult = await callLLM({
      tier: "fast",
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Concept: ${humanize(themeId)} (id: ${themeId}). Skill level: ${tier}. Explain it.`,
        },
      ],
      temperature: 0.3,
      maxTokens: 400,
    });
  } catch (err) {
    const e = err instanceof LLMError ? err : new Error(String(err));
    return NextResponse.json(
      { error: `Lesson API error: ${e.message}` },
      { status: 502 }
    );
  }

  const lesson = parseLesson(llmResult.content);
  if (!lesson) {
    return NextResponse.json(
      { error: "Could not generate a lesson — please try again." },
      { status: 502 }
    );
  }

  cache.set(key, lesson);
  return NextResponse.json({
    themeId,
    tier,
    lesson,
    cached: false,
    provider: llmResult.provider,
  });
}
