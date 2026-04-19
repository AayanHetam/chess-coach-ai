/**
 * Repetit Training System
 *
 * When AI suggests puzzles like "Practice King Safety" or "Practice Rook Activation",
 * the puzzles are saved under "Repetit Training: [Concept]" for the user to review,
 * complete, and track progress over time.
 *
 * Architecture:
 * - AI-suggested puzzle sets → Saved with concept name + timestamp
 * - All attempts tracked → User profile history with performance stats
 * - Rewards → XP, streaks, completion badges
 */

import { ChessPuzzle } from "./chessPuzzlesService";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface RepetitTrainingSet {
  id: string; // UUID
  conceptName: string; // "King Safety", "Rook Activation", etc.
  theme: string; // Normalized theme ID from Neo4j (e.g., "exposed-king")
  displayName: string; // "Repetit Training: King Safety"
  puzzles: ChessPuzzle[];
  createdAt: number; // timestamp
  source: "ai-coach" | "manual-selection";
  difficulty?: "beginner" | "intermediate" | "advanced";

  // Progress tracking
  completedPuzzleIds: string[];
  attemptedPuzzleIds: string[];
  accuracy: number; // 0-100
  averageTime?: number; // seconds per puzzle
  lastAttemptedAt?: number; // timestamp
}

export interface PuzzleAttempt {
  id: string; // UUID
  puzzleId: string;
  setId?: string; // Links to RepetitTrainingSet if from a set
  userId: string;
  success: boolean;
  movesPlayed: string[]; // User's attempted moves
  timeSpentSeconds: number;
  attemptedAt: number; // timestamp
  hintsUsed: number;
  conceptName?: string; // For analytics (e.g., "King Safety")
}

export interface UserPuzzleStats {
  userId: string;
  totalAttempts: number;
  totalSolved: number;
  accuracy: number; // 0-100
  xp: number;
  currentStreak: number; // Days with at least 1 puzzle solved
  longestStreak: number;
  trainingSetStats: Record<string, {
    attempts: number;
    solved: number;
    accuracy: number;
    lastAttemptedAt: number;
  }>;
  recentAttempts: PuzzleAttempt[]; // Last 50 attempts
}

// ── Storage Keys ──────────────────────────────────────────────────────────────

const STORAGE_KEYS = {
  trainingSets: "chess_masti_repetit_training_sets",
  puzzleAttempts: "chess_masti_puzzle_attempts",
  userStats: "chess_masti_puzzle_stats",
} as const;

// ── Training Set Management ───────────────────────────────────────────────────

/**
 * Create a new Repetit Training set from AI-suggested puzzles.
 */
export function createTrainingSet(params: {
  conceptName: string;
  theme: string;
  puzzles: ChessPuzzle[];
  userId: string;
  difficulty?: "beginner" | "intermediate" | "advanced";
}): RepetitTrainingSet {
  const { conceptName, theme, puzzles, difficulty } = params;

  const setId = `repetit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

  const trainingSet: RepetitTrainingSet = {
    id: setId,
    conceptName,
    theme,
    displayName: `Repetit Training: ${conceptName}`,
    puzzles,
    createdAt: Date.now(),
    source: "ai-coach",
    difficulty,
    completedPuzzleIds: [],
    attemptedPuzzleIds: [],
    accuracy: 0,
  };

  // Save to localStorage
  const sets = getAllTrainingSets();
  sets.push(trainingSet);
  localStorage.setItem(STORAGE_KEYS.trainingSets, JSON.stringify(sets));

  console.log(`✅ Created Repetit Training set: "${conceptName}" with ${puzzles.length} puzzles`);

  return trainingSet;
}

/**
 * Get all Repetit Training sets for the current user.
 */
export function getAllTrainingSets(): RepetitTrainingSet[] {
  if (typeof window === "undefined") return [];

  const stored = localStorage.getItem(STORAGE_KEYS.trainingSets);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Get a specific training set by ID.
 */
export function getTrainingSet(setId: string): RepetitTrainingSet | null {
  const sets = getAllTrainingSets();
  return sets.find(s => s.id === setId) || null;
}

/**
 * Delete a training set.
 */
export function deleteTrainingSet(setId: string): void {
  const sets = getAllTrainingSets().filter(s => s.id !== setId);
  localStorage.setItem(STORAGE_KEYS.trainingSets, JSON.stringify(sets));
}

// ── Puzzle Attempt Tracking ───────────────────────────────────────────────────

/**
 * Record a puzzle attempt.
 */
export function recordPuzzleAttempt(params: {
  puzzleId: string;
  setId?: string;
  userId: string;
  success: boolean;
  movesPlayed: string[];
  timeSpentSeconds: number;
  hintsUsed?: number;
  conceptName?: string;
}): PuzzleAttempt {
  const attempt: PuzzleAttempt = {
    id: `attempt_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    puzzleId: params.puzzleId,
    setId: params.setId,
    userId: params.userId,
    success: params.success,
    movesPlayed: params.movesPlayed,
    timeSpentSeconds: params.timeSpentSeconds,
    attemptedAt: Date.now(),
    hintsUsed: params.hintsUsed || 0,
    conceptName: params.conceptName,
  };

  // Save attempt
  const attempts = getAllAttempts();
  attempts.push(attempt);
  localStorage.setItem(STORAGE_KEYS.puzzleAttempts, JSON.stringify(attempts));

  // Update training set progress if from a set
  if (params.setId) {
    updateTrainingSetProgress(params.setId, params.puzzleId, params.success);
  }

  // Update user stats
  updateUserStats(params.userId, attempt);

  return attempt;
}

/**
 * Get all puzzle attempts for the current user.
 */
export function getAllAttempts(): PuzzleAttempt[] {
  if (typeof window === "undefined") return [];

  const stored = localStorage.getItem(STORAGE_KEYS.puzzleAttempts);
  if (!stored) return [];

  try {
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Get attempts for a specific training set.
 */
export function getAttemptsForSet(setId: string): PuzzleAttempt[] {
  return getAllAttempts().filter(a => a.setId === setId);
}

/**
 * Update training set progress after an attempt.
 */
function updateTrainingSetProgress(setId: string, puzzleId: string, success: boolean): void {
  const sets = getAllTrainingSets();
  const set = sets.find(s => s.id === setId);

  if (!set) return;

  // Add to attempted list
  if (!set.attemptedPuzzleIds.includes(puzzleId)) {
    set.attemptedPuzzleIds.push(puzzleId);
  }

  // Add to completed list if successful
  if (success && !set.completedPuzzleIds.includes(puzzleId)) {
    set.completedPuzzleIds.push(puzzleId);
  }

  // Update accuracy
  const attempts = getAttemptsForSet(setId);
  const successful = attempts.filter(a => a.success).length;
  set.accuracy = attempts.length > 0 ? Math.round((successful / attempts.length) * 100) : 0;

  // Update average time
  const totalTime = attempts.reduce((sum, a) => sum + a.timeSpentSeconds, 0);
  set.averageTime = attempts.length > 0 ? Math.round(totalTime / attempts.length) : undefined;

  // Update last attempted timestamp
  set.lastAttemptedAt = Date.now();

  // Save updated sets
  localStorage.setItem(STORAGE_KEYS.trainingSets, JSON.stringify(sets));
}

// ── User Stats & Rewards ──────────────────────────────────────────────────────

/**
 * Get user puzzle stats (for profile page).
 */
export function getUserStats(userId: string): UserPuzzleStats {
  if (typeof window === "undefined") {
    return createEmptyStats(userId);
  }

  const stored = localStorage.getItem(STORAGE_KEYS.userStats);
  if (!stored) return createEmptyStats(userId);

  try {
    const stats = JSON.parse(stored);
    return stats[userId] || createEmptyStats(userId);
  } catch {
    return createEmptyStats(userId);
  }
}

function createEmptyStats(userId: string): UserPuzzleStats {
  return {
    userId,
    totalAttempts: 0,
    totalSolved: 0,
    accuracy: 0,
    xp: 0,
    currentStreak: 0,
    longestStreak: 0,
    trainingSetStats: {},
    recentAttempts: [],
  };
}

/**
 * Update user stats after a puzzle attempt.
 */
function updateUserStats(userId: string, attempt: PuzzleAttempt): void {
  const allStats = loadAllUserStats();
  const userStats = allStats[userId] || createEmptyStats(userId);

  // Update totals
  userStats.totalAttempts += 1;
  if (attempt.success) {
    userStats.totalSolved += 1;
    userStats.xp += calculateXP(attempt);
  }

  // Update accuracy
  userStats.accuracy = Math.round((userStats.totalSolved / userStats.totalAttempts) * 100);

  // Update recent attempts (keep last 50)
  userStats.recentAttempts.unshift(attempt);
  if (userStats.recentAttempts.length > 50) {
    userStats.recentAttempts = userStats.recentAttempts.slice(0, 50);
  }

  // Update training set stats
  if (attempt.setId && attempt.conceptName) {
    const setStats = userStats.trainingSetStats[attempt.setId] || {
      attempts: 0,
      solved: 0,
      accuracy: 0,
      lastAttemptedAt: 0,
    };

    setStats.attempts += 1;
    if (attempt.success) setStats.solved += 1;
    setStats.accuracy = Math.round((setStats.solved / setStats.attempts) * 100);
    setStats.lastAttemptedAt = Date.now();

    userStats.trainingSetStats[attempt.setId] = setStats;
  }

  // Update streaks
  updateStreaks(userStats);

  // Save
  allStats[userId] = userStats;
  localStorage.setItem(STORAGE_KEYS.userStats, JSON.stringify(allStats));
}

function loadAllUserStats(): Record<string, UserPuzzleStats> {
  if (typeof window === "undefined") return {};

  const stored = localStorage.getItem(STORAGE_KEYS.userStats);
  if (!stored) return {};

  try {
    return JSON.parse(stored);
  } catch {
    return {};
  }
}

function calculateXP(attempt: PuzzleAttempt): number {
  let xp = 10; // Base XP for attempting

  if (attempt.success) {
    xp += 50; // Success bonus

    // Speed bonus (if solved quickly)
    if (attempt.timeSpentSeconds < 30) xp += 20;
    else if (attempt.timeSpentSeconds < 60) xp += 10;

    // No-hints bonus
    if (attempt.hintsUsed === 0) xp += 15;
  }

  return xp;
}

function updateStreaks(stats: UserPuzzleStats): void {
  const today = new Date().setHours(0, 0, 0, 0);
  const yesterday = today - 86400000; // 24 hours

  // Check if solved at least one puzzle today
  const solvedToday = stats.recentAttempts.some(a => {
    const attemptDay = new Date(a.attemptedAt).setHours(0, 0, 0, 0);
    return a.success && attemptDay === today;
  });

  const solvedYesterday = stats.recentAttempts.some(a => {
    const attemptDay = new Date(a.attemptedAt).setHours(0, 0, 0, 0);
    return a.success && attemptDay === yesterday;
  });

  if (solvedToday) {
    // Continue streak or start new one
    if (solvedYesterday || stats.currentStreak === 0) {
      stats.currentStreak += 1;
    }
  } else if (!solvedYesterday) {
    // Streak broken
    stats.currentStreak = 0;
  }

  // Update longest streak
  if (stats.currentStreak > stats.longestStreak) {
    stats.longestStreak = stats.currentStreak;
  }
}
