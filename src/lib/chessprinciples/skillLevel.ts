export interface SkillLevel {
  name: string;
  minRating: number;
  maxRating: number;
  minAccuracy: number;
  maxAccuracy: number;
  focusAreas: string[];
  violationSensitivity: number;
}

// Map accuracy percentage to estimated skill level
export function getSkillLevelFromAccuracy(accuracy: number): SkillLevel {
  if (accuracy >= 95) return EXPERT_LEVEL;
  if (accuracy >= 85) return ADVANCED_LEVEL;
  if (accuracy >= 70) return INTERMEDIATE_LEVEL;
  if (accuracy >= 50) return IMPROVING_LEVEL;
  return BEGINNER_LEVEL;
}

// Map accuracy to estimated rating (approximate correlation)
export function getEstimatedRatingFromAccuracy(accuracy: number): number {
  // Based on statistical analysis of accuracy vs rating correlation
  if (accuracy >= 95) return Math.min(2400, 1800 + (accuracy - 95) * 120); // 1800-2400+
  if (accuracy >= 85) return 1400 + (accuracy - 85) * 40; // 1400-1800
  if (accuracy >= 70) return 1000 + (accuracy - 70) * 26.67; // 1000-1400
  if (accuracy >= 50) return 600 + (accuracy - 50) * 20; // 600-1000
  return Math.max(100, 200 + accuracy * 8); // 100-600
}

const BEGINNER_LEVEL: SkillLevel = {
  name: "Beginner",
  minRating: 100,
  maxRating: 1000,
  minAccuracy: 0,
  maxAccuracy: 50,
  focusAreas: [
    "Don't hang pieces - check piece safety",
    "Look for basic tactics - forks, pins, skewers",
    "Castle early for king safety",
    "Complete development before attacking",
  ],
  violationSensitivity: 0.3, // Low sensitivity - only catch major errors
};

const IMPROVING_LEVEL: SkillLevel = {
  name: "Improving",
  minRating: 1000,
  maxRating: 1400,
  minAccuracy: 50,
  maxAccuracy: 70,
  focusAreas: [
    "Look for basic tactics consistently",
    "Basic positional understanding",
    "Complete development first",
    "Avoiding common opening traps",
  ],
  violationSensitivity: 0.5, // Medium sensitivity
};

const INTERMEDIATE_LEVEL: SkillLevel = {
  name: "Intermediate",
  minRating: 1400,
  maxRating: 1800,
  minAccuracy: 70,
  maxAccuracy: 85,
  focusAreas: [
    "Improve your worst piece - piece activity",
    "Complex positional concepts",
    "Advanced endgame technique",
    "Strategic planning and coordination",
  ],
  violationSensitivity: 0.7, // Higher sensitivity
};

const ADVANCED_LEVEL: SkillLevel = {
  name: "Advanced",
  minRating: 1800,
  maxRating: 2200,
  minAccuracy: 85,
  maxAccuracy: 95,
  focusAreas: [
    "Think prophylactically - prevent opponent plans",
    "Subtle positional nuances",
    "Complex endgame theory",
    "Opening preparation depth",
  ],
  violationSensitivity: 0.85, // High sensitivity
};

const EXPERT_LEVEL: SkillLevel = {
  name: "Expert",
  minRating: 2200,
  maxRating: 3000,
  minAccuracy: 95,
  maxAccuracy: 100,
  focusAreas: [
    "Near-perfect calculation",
    "Deep opening theory",
    "Precise endgame technique",
    "Psychological factors",
  ],
  violationSensitivity: 0.95, // Very high sensitivity
};

// Skill-specific feedback messages
export function getSkillLevelFeedback(
  skillLevel: SkillLevel,
  hasViolations: boolean
): string {
  const base = `Based on your accuracy (${skillLevel.name} level), `;

  if (skillLevel.name === "Beginner") {
    return hasViolations
      ? base +
          "focus on the fundamentals: don't hang pieces, look for basic tactics, and castle early."
      : base +
          "you're doing well with the basics! Keep focusing on piece safety and simple tactics.";
  }

  if (skillLevel.name === "Improving") {
    return hasViolations
      ? base +
          "work on deeper tactical calculation and basic positional understanding."
      : base +
          "good tactical awareness! Now focus on positional concepts and planning.";
  }

  if (skillLevel.name === "Intermediate") {
    return hasViolations
      ? base + "refine your positional understanding and strategic planning."
      : base +
          "solid play! Focus on subtle positional factors and deeper calculation.";
  }

  if (skillLevel.name === "Advanced") {
    return hasViolations
      ? base + "work on prophylactic thinking and precise calculation."
      : base +
          "excellent chess! Minor refinements in calculation and positional nuances will help.";
  }

  return hasViolations
    ? base +
        "even at expert level, there's always room for perfection in calculation and evaluation."
    : base +
        "outstanding chess! You're playing at expert level with minimal errors.";
}

// Check if a violation is significant for the skill level
export function isViolationSignificant(
  severity: "minor" | "moderate" | "major",
  skillLevel: SkillLevel
): boolean {
  const severityWeight =
    severity === "major" ? 1.0 : severity === "moderate" ? 0.7 : 0.3;
  return severityWeight >= skillLevel.violationSensitivity;
}

// Get skill-specific priority principles for the current skill level
export function getSkillLevelPrinciples(skillLevel: SkillLevel): string[] {
  return skillLevel.focusAreas;
}
