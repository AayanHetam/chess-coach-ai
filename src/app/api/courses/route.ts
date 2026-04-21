import { NextResponse } from "next/server";
import { ChessPuzzle } from "@/lib/chessPuzzlesService";

export interface Course {
  id: string;
  title: string;
  description: string;
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  category: 'openings' | 'middlegame' | 'endgame' | 'tactics' | 'strategy';
  puzzles: ChessPuzzle[];
  concepts: string[];
  estimatedTime: number; // minutes
  prerequisites?: string[];
}

// Sample course data - in production this would come from database
const SAMPLE_COURSES: Course[] = [
  {
    id: "beginner-tactics",
    title: "Beginner Tactics",
    description: "Learn fundamental tactical patterns that every chess player needs to know. Perfect for players just starting their tactical journey.",
    difficulty: "beginner",
    category: "tactics",
    concepts: ["Fork", "Pin", "Skewer", "Discovered Attack", "Double Attack"],
    estimatedTime: 45,
    puzzles: [], // Will be populated from puzzle database
    prerequisites: []
  },
  {
    id: "intermediate-checkmates",
    title: "Intermediate Checkmate Patterns",
    description: "Master common checkmate patterns that appear frequently in real games. Build your pattern recognition skills.",
    difficulty: "intermediate",
    category: "endgame",
    concepts: ["Back Rank Mate", "Smothered Mate", "Queen Sacrifice", "Rook Lift"],
    estimatedTime: 60,
    puzzles: [],
    prerequisites: ["beginner-tactics"]
  },
  {
    id: "advanced-openings",
    title: "Advanced Opening Principles",
    description: "Deep dive into opening theory and strategic planning. Learn how to navigate complex opening positions.",
    difficulty: "advanced",
    category: "openings",
    concepts: ["Center Control", "Piece Development", "King Safety", "Initiative"],
    estimatedTime: 90,
    puzzles: [],
    prerequisites: ["intermediate-checkmates"]
  },
  {
    id: "endgame-mastery",
    title: "Endgame Mastery",
    description: "Comprehensive endgame training covering all essential endgame techniques and theoretical positions.",
    difficulty: "expert",
    category: "endgame",
    concepts: ["Opposition", "Zugzwang", "Fortress", "Pawn Endgames"],
    estimatedTime: 120,
    puzzles: [],
    prerequisites: ["advanced-openings"]
  }
];

export async function GET() {
  try {
    // In production, fetch from database
    // For now, return sample courses with puzzle data populated
    const coursesWithPuzzles = await Promise.all(
      SAMPLE_COURSES.map(async (course) => {
        // Fetch 50 puzzles for each course based on theme
        const { queryPuzzles } = await import("@/lib/puzzleRepository");
        const puzzles = await queryPuzzles({
          themes: [course.category],
          limit: 50,
        });
        
        return {
          ...course,
          puzzles
        };
      })
    );

    return NextResponse.json({
      success: true,
      courses: coursesWithPuzzles
    });
  } catch (error) {
    console.error("Error fetching courses:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to fetch courses" 
      },
      { status: 500 }
    );
  }
}
