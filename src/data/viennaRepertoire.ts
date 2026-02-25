import type { OpeningRepertoire, OpeningCourse, OpeningChapter } from "@/types/openings";
import viennaLines from "./vienna-lines.json";

/**
 * Build the Vienna Game as a single OpeningCourse with 10 chapters.
 * Each chapter contains its own repertoire with all drill lines.
 */

interface ParsedLine {
  id: string;
  name: string;
  moves: string[];
  description: string;
}

/** Chapter metadata — order matters (this is the chapter order shown to users). */
const CHAPTERS: {
  key: string;
  id: string;
  name: string;
  eco: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  description: string;
}[] = [
  {
    key: "Vienna 2.Nc3 Nf6 3.d4 ?",
    id: "vienna-ch1-nf6-d4",
    name: "2...Nf6 3.d4 — The Main Push",
    eco: "C26",
    difficulty: "intermediate",
    description: "White pushes d4 immediately. Covers Bb4, Bc5 responses and the Bc4/Qh5 sideline.",
  },
  {
    key: "Vienna 2.Nc3 Bc5 3.Qh5 ?",
    id: "vienna-ch2-bc5-qh5",
    name: "2...Bc5 3.Qh5 — Surprise Weapon",
    eco: "C25",
    difficulty: "intermediate",
    description: "The surprising 3.Qh5! against 2...Bc5. Sound and independent with a small plus for White.",
  },
  {
    key: "Vienna 2.Nc3 Nc6 3.Bc4 Na5 ?",
    id: "vienna-ch3-na5",
    name: "3...Nf6 4.d3 Na5 — Bishop Exchange",
    eco: "C28",
    difficulty: "advanced",
    description: "Black plays Na5 to trade the Bc4. White responds with Bb3 and f4 for complex middlegames.",
  },
  {
    key: "Vienna 2.Nc3 Nc6 3.Bc4 Nf6 4.d3 Be7",
    id: "vienna-ch4-be7",
    name: "4.d3 Be7 — Quiet Development",
    eco: "C25",
    difficulty: "beginner",
    description: "Black develops quietly. White plays a3 then f4 for a comfortable position with attacking chances.",
  },
  {
    key: "Vienna 2.Nc3 Nc6 3.Bc4 Nf6 4.d3 Bb4",
    id: "vienna-ch5-bb4",
    name: "4.d3 Bb4 — The Pin",
    eco: "C28",
    difficulty: "intermediate",
    description: "Black pins Nc3 with Bb4. White plays Nge2 for rich tactical play. Covers 5...d5 and 5...O-O.",
  },
  {
    key: "Vienna 2.Nc3 Nc6 3.Bc4 Nf6 5.f4 d6",
    id: "vienna-ch6-bc5-f4-d6",
    name: "4.d3 Bc5 5.f4 d6 — The f4 Push",
    eco: "C30",
    difficulty: "intermediate",
    description: "After Bc5 and f4, Black plays d6. Key idea: Qd2 + O-O-O. Covers Bg4, Be6, Ng4, Nd4.",
  },
  {
    key: "Vienna 2.Nc3 Nc6 3.Bc4 Nf6 4.d3 Bc5 5.f4 0-0",
    id: "vienna-ch7-bc5-f4-oo",
    name: "5.f4 O-O — Sharp Tactics",
    eco: "C30",
    difficulty: "advanced",
    description: "Black castles early vs f4. The most complex chapter — Ng4, d5 breaks, Re8, Nd4 counterplay.",
  },
  {
    key: "Vienna 2.Nc3 Nc6 3.Bc4 Nf6 4.d3 Bc5 5.f4 d5",
    id: "vienna-ch8-bc5-f4-d5",
    name: "5.f4 d5 — Central Strike",
    eco: "C28",
    difficulty: "advanced",
    description: "Black strikes with d5 vs f4. After Nxd5, Na5! is key. Covers the Ng4 gambit and Qe2 system.",
  },
  {
    key: "Vienna 2.Nc3 Nc6 3.Bc4 Nf6 5.f4 exf4 6.Bxf4 d6",
    id: "vienna-ch9-exf4-d6",
    name: "5...exf4 6.Bxf4 d6 — Recapture Lines",
    eco: "C30",
    difficulty: "intermediate",
    description: "Black takes f4, plays d6. White recaptures Bxf4 + Nf3. Qd2 + O-O-O plan is central.",
  },
  {
    key: "Vienna 2.Nc3 Nc6 3.Bc4 Nf6 5.f4 exf4 6.Bxf4 0-0",
    id: "vienna-ch10-exf4-oo",
    name: "5...exf4 6.Bxf4 O-O — Deep Theory",
    eco: "C28",
    difficulty: "advanced",
    description: "The most theory-heavy chapter. Covers Ng4, Re8, d5, Nd4, d6 mainline with model games.",
  },
];

function groupByChapter(lines: ParsedLine[]): Record<string, ParsedLine[]> {
  const groups: Record<string, ParsedLine[]> = {};
  for (const line of lines) {
    const match = line.name.match(/^(.*?)\s*\(/);
    const chapter = match ? match[1].trim() : "Unknown";
    if (!groups[chapter]) groups[chapter] = [];
    groups[chapter].push(line);
  }
  return groups;
}

function buildViennaCourse(): OpeningCourse {
  const grouped = groupByChapter(viennaLines as ParsedLine[]);
  const chapters: OpeningChapter[] = [];

  for (const meta of CHAPTERS) {
    const lines = grouped[meta.key] || [];
    if (lines.length === 0) continue;

    const repertoire: OpeningRepertoire = {
      id: meta.id,
      name: meta.name,
      eco: meta.eco,
      color: "white",
      difficulty: meta.difficulty,
      description: meta.description,
      themes: [],
      lines: lines.map((l, idx) => ({
        id: l.id,
        name: `Line ${idx + 1}`,
        moves: l.moves,
        description: l.description,
      })),
    };

    chapters.push({
      id: meta.id,
      name: meta.name,
      description: meta.description,
      repertoire,
    });
  }

  return {
    id: "vienna-course",
    name: "The Vienna Game",
    color: "white",
    difficulty: "intermediate",
    description:
      "A complete White repertoire based on 1.e4 e5 2.Nc3. Covers every major Black response across 10 chapters with 417 drill lines. Sharp, tactical, and full of tricks.",
    themes: ["attacking", "tactics", "center control", "f4 push", "Qh5 trick"],
    chapters,
  };
}

export const VIENNA_COURSE: OpeningCourse = buildViennaCourse();
