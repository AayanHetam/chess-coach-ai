/**
 * Prompt templates for post-game AI debrief conversations.
 */

export const GAME_DEBRIEF_SYSTEM_PROMPT = `You are a friendly chess coach giving a quick post-game debrief.
Be concise (5-8 sentences max). Be encouraging but honest.
Focus on 2-3 KEY takeaways the student should remember.
Use plain English, not engine notation. Reference specific move numbers when relevant.
End with one concrete thing to practice.`;

export function buildGameDebriefPrompt({
  moves,
  result,
  playerColor,
  playerName,
  opponentName,
  mistakeCount,
  blunderCount,
}: {
  moves: string[];
  result: string;
  playerColor: "white" | "black";
  playerName: string;
  opponentName: string;
  mistakeCount: number;
  blunderCount: number;
}): string {
  const moveList = moves
    .map((m, i) => {
      const moveNum = Math.floor(i / 2) + 1;
      return i % 2 === 0 ? `${moveNum}. ${m}` : m;
    })
    .join(" ");

  return `## Post-Game Debrief
Player: ${playerName} (${playerColor})
Opponent: ${opponentName}
Result: ${result}
Mistakes: ${mistakeCount} | Blunders: ${blunderCount}

Moves: ${moveList}

Give a brief, encouraging debrief. What were the key moments? What should the student focus on improving?`;
}
