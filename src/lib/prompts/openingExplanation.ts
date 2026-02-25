/**
 * Prompt templates for AI coach opening explanations.
 * Used after a user completes an opening drill.
 */

export const OPENING_EXPLANATION_SYSTEM_PROMPT = `You are a friendly chess coach explaining an opening to a student.
Be concise (4-6 sentences). Use plain English.
Focus on the STRATEGIC IDEAS — pawn structures, piece placement, typical plans, and key squares.
Do NOT just list the moves. Explain WHY the moves are played and what both sides are trying to achieve.`;

export function buildOpeningExplanationPrompt({
  openingName,
  lineName,
  moves,
  color,
  themes,
}: {
  openingName: string;
  lineName: string;
  moves: string[];
  color: "white" | "black";
  themes: string[];
}): string {
  const movesStr = moves
    .map((m, i) => {
      const moveNum = Math.floor(i / 2) + 1;
      return i % 2 === 0 ? `${moveNum}. ${m}` : m;
    })
    .join(" ");

  return `## Opening: ${openingName} — ${lineName}
Color: ${color}
Themes: ${themes.join(", ")}
Moves: ${movesStr}

Explain the key strategic ideas behind this opening line for a ${color} player. What's the plan? What pawn structures should they expect? What are the key pieces and squares?`;
}
