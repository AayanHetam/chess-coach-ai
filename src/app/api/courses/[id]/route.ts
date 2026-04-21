import { NextResponse } from "next/server";
import { Course } from "../route";
import { queryPuzzles } from "@/lib/puzzleRepository";

const COURSE_MAP: Record<string, Omit<Course, 'puzzles'>> = {
  "beginner-tactics": {
    id: "beginner-tactics",
    title: "Beginner Tactics",
    description: "Learn fundamental tactical patterns that every chess player needs to know. Perfect for players just starting their tactical journey.",
    difficulty: "beginner",
    category: "tactics",
    concepts: ["Fork", "Pin", "Skewer", "Discovered Attack", "Double Attack"],
    estimatedTime: 45,
    prerequisites: []
  },
  "intermediate-checkmates": {
    id: "intermediate-checkmates",
    title: "Intermediate Checkmate Patterns",
    description: "Master common checkmate patterns that appear frequently in real games. Build your pattern recognition skills.",
    difficulty: "intermediate",
    category: "endgame",
    concepts: ["Back Rank Mate", "Smothered Mate", "Queen Sacrifice", "Rook Lift"],
    estimatedTime: 60,
    prerequisites: ["beginner-tactics"]
  },
  "advanced-openings": {
    id: "advanced-openings",
    title: "Advanced Opening Principles",
    description: "Deep dive into opening theory and strategic planning. Learn how to navigate complex opening positions.",
    difficulty: "advanced",
    category: "openings",
    concepts: ["Center Control", "Piece Development", "King Safety", "Initiative"],
    estimatedTime: 90,
    prerequisites: ["intermediate-checkmates"]
  },
  "endgame-mastery": {
    id: "endgame-mastery",
    title: "Endgame Mastery",
    description: "Comprehensive endgame training covering all essential endgame techniques and theoretical positions.",
    difficulty: "expert",
    category: "endgame",
    concepts: ["Opposition", "Zugzwang", "Fortress", "Pawn Endgames"],
    estimatedTime: 120,
    prerequisites: ["advanced-openings"]
  }
};

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id: courseId } = await context.params;
    const courseData = COURSE_MAP[courseId];

    if (!courseData) {
      return NextResponse.json(
        { 
          success: false, 
          error: "Course not found" 
        },
        { status: 404 }
      );
    }

    // Fetch 50 puzzles for this course
    const puzzles = await queryPuzzles({
      themes: [courseData.category],
      limit: 50,
    });

    const course: Course = {
      ...courseData,
      puzzles
    };

    return NextResponse.json({
      success: true,
      course
    });
  } catch (error) {
    console.error("Error fetching course:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: "Failed to fetch course" 
      },
      { status: 500 }
    );
  }
}
