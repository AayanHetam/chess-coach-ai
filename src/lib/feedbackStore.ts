/**
 * Feedback Store — Client-side storage for AI coaching feedback.
 * Uses localStorage to persist thumbs up/down ratings on AI responses.
 */

export interface FeedbackEntry {
  id: string;
  timestamp: number;
  rating: "positive" | "negative";
  responseText: string;
  fen?: string;
  userRating?: number;
  coachId?: string;
  userMessage?: string;
}

const STORAGE_KEY = "chess_masti_ai_feedback";
const MAX_ENTRIES = 500;

/**
 * Store a feedback entry in localStorage.
 */
export function storeFeedback(entry: Omit<FeedbackEntry, "id" | "timestamp">): FeedbackEntry {
  const fullEntry: FeedbackEntry = {
    ...entry,
    id: generateFeedbackId(),
    timestamp: Date.now(),
  };

  const existing = getAllFeedback();
  existing.push(fullEntry);

  // Keep only the most recent entries
  const trimmed = existing.slice(-MAX_ENTRIES);

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) {
    console.warn("Failed to store feedback:", e);
  }

  return fullEntry;
}

/**
 * Get all stored feedback entries.
 */
export function getAllFeedback(): FeedbackEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as FeedbackEntry[];
  } catch {
    return [];
  }
}

/**
 * Get feedback statistics.
 */
export function getFeedbackStats(): {
  total: number;
  positive: number;
  negative: number;
  positiveRate: number;
  recentTrend: "improving" | "declining" | "stable";
} {
  const entries = getAllFeedback();
  const total = entries.length;
  const positive = entries.filter(e => e.rating === "positive").length;
  const negative = total - positive;
  const positiveRate = total > 0 ? positive / total : 0;

  // Recent trend: compare last 20 vs previous 20
  let recentTrend: "improving" | "declining" | "stable" = "stable";
  if (entries.length >= 40) {
    const recent = entries.slice(-20);
    const previous = entries.slice(-40, -20);
    const recentRate = recent.filter(e => e.rating === "positive").length / 20;
    const previousRate = previous.filter(e => e.rating === "positive").length / 20;
    if (recentRate > previousRate + 0.1) recentTrend = "improving";
    else if (recentRate < previousRate - 0.1) recentTrend = "declining";
  }

  return { total, positive, negative, positiveRate, recentTrend };
}

/**
 * Get the lowest-rated (negative) responses for review.
 */
export function getNegativeFeedback(limit: number = 20): FeedbackEntry[] {
  return getAllFeedback()
    .filter(e => e.rating === "negative")
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

function generateFeedbackId(): string {
  return `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
