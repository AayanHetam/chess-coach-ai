import { atomWithStorage } from "jotai/utils";
import type { PlayerProfile } from "./playerProfile";
import type { PuzzleStats } from "./puzzleRating";

/**
 * Personalized Training Plan Generator
 *
 * Creates a structured weekly training plan based on:
 * - Player profile (strengths/weaknesses)
 * - Puzzle stats (rating, theme performance)
 * - Opening drill progress
 */

export interface TrainingActivity {
  id: string;
  type: "puzzles" | "openings" | "play" | "analysis" | "endgame" | "pattern";
  title: string;
  description: string;
  duration: string;
  priority: "high" | "medium" | "low";
  link?: string;
  completed?: boolean;
}

export interface DailyPlan {
  day: string;
  activities: TrainingActivity[];
}

export interface TrainingPlan {
  id: string;
  name: string;
  generatedAt: number;
  weeklyGoal: string;
  dailyPlans: DailyPlan[];
  focusAreas: string[];
}

/**
 * Persistent storage for the current training plan.
 */
export const trainingPlanAtom = atomWithStorage<TrainingPlan | null>(
  "chessMastiTrainingPlan",
  null
);

/**
 * Persistent storage for completed activity IDs.
 */
export const completedActivitiesAtom = atomWithStorage<string[]>(
  "chessMastiCompletedActivities",
  []
);

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Generate a personalized training plan based on player data.
 */
export function generateTrainingPlan(
  profile: PlayerProfile,
  puzzleStats: PuzzleStats,
  drillProgress: Record<string, { attempts: number; correctFirstTry: number }>
): TrainingPlan {
  const focusAreas: string[] = [];
  const dailyPlans: DailyPlan[] = [];

  // Determine focus areas
  if (profile.totalGames > 0) {
    if (profile.weakestPhase === "opening") focusAreas.push("Opening Preparation");
    if (profile.weakestPhase === "middlegame") focusAreas.push("Tactical Calculation");
    if (profile.weakestPhase === "endgame") focusAreas.push("Endgame Technique");
    if (profile.blundersPerGame >= 2) focusAreas.push("Blunder Reduction");
  }

  // Puzzle-based focus
  const weakThemes = Object.entries(puzzleStats.themeStats)
    .filter(([_, data]) => data.attempts >= 3 && (data.solved / data.attempts) < 0.5)
    .sort((a, b) => (a[1].solved / a[1].attempts) - (b[1].solved / b[1].attempts))
    .slice(0, 3)
    .map(([theme]) => theme);

  if (weakThemes.length > 0) {
    focusAreas.push(`Weak Tactics: ${weakThemes.join(", ")}`);
  }

  // Opening drill focus
  const totalDrilled = Object.values(drillProgress).filter((d) => d.attempts > 0).length;
  if (totalDrilled < 5) {
    focusAreas.push("Build Opening Repertoire");
  }

  if (focusAreas.length === 0) {
    focusAreas.push("General Improvement");
  }

  // Generate daily plans
  for (let d = 0; d < 7; d++) {
    const day = DAYS[d];
    const activities: TrainingActivity[] = [];

    // Daily puzzle (every day)
    activities.push({
      id: `daily-puzzle-${d}`,
      type: "puzzles",
      title: "Daily Puzzle",
      description: "Solve the daily puzzle to maintain your streak.",
      duration: "5 min",
      priority: "high",
      link: "/practice",
    });

    if (d % 2 === 0) {
      // Even days: Tactics focus
      activities.push({
        id: `tactics-${d}`,
        type: "puzzles",
        title: weakThemes.length > 0
          ? `Targeted Tactics: ${weakThemes[d % weakThemes.length] || "mixed"}`
          : "Puzzle Rush",
        description: weakThemes.length > 0
          ? `Focus on your weakest theme to improve pattern recognition.`
          : "Try a 3-minute puzzle rush to sharpen your tactical vision.",
        duration: "15 min",
        priority: "high",
        link: "/practice",
      });
    }

    if (d % 3 === 0) {
      // Every 3rd day: Opening drills
      activities.push({
        id: `openings-${d}`,
        type: "openings",
        title: "Opening Drill Session",
        description: "Review due lines and learn new variations.",
        duration: "10 min",
        priority: "medium",
        link: "/openings",
      });
    }

    if (d === 1 || d === 4) {
      // Twice a week: Play a game
      activities.push({
        id: `play-${d}`,
        type: "play",
        title: "Play a Game",
        description: "Play a game vs AI and focus on applying what you've learned.",
        duration: "20 min",
        priority: "medium",
        link: "/play",
      });
    }

    if (d === 2 || d === 5) {
      // Twice a week: Analyze
      activities.push({
        id: `analyze-${d}`,
        type: "analysis",
        title: "Analyze Your Game",
        description: "Review your recent game. Focus on critical moments and missed tactics.",
        duration: "15 min",
        priority: "medium",
        link: "/analysis",
      });
    }

    if (d === 6) {
      // Weekend: Pattern training
      activities.push({
        id: `pattern-${d}`,
        type: "pattern",
        title: "Pattern Recognition",
        description: "Quick-fire pattern drills to build intuition.",
        duration: "10 min",
        priority: "low",
        link: "/practice",
      });
    }

    dailyPlans.push({ day, activities });
  }

  // Weekly goal
  let weeklyGoal = "Improve your overall chess skills through consistent daily practice.";
  if (focusAreas.includes("Blunder Reduction")) {
    weeklyGoal = "Reduce blunders by slowing down and checking for threats before each move.";
  } else if (focusAreas.includes("Opening Preparation")) {
    weeklyGoal = "Strengthen your opening play by drilling key variations and understanding plans.";
  } else if (focusAreas.includes("Tactical Calculation")) {
    weeklyGoal = "Sharpen your tactical vision by solving targeted puzzles daily.";
  }

  return {
    id: `plan-${Date.now()}`,
    name: "Weekly Training Plan",
    generatedAt: Date.now(),
    weeklyGoal,
    dailyPlans,
    focusAreas,
  };
}
