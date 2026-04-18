/**
 * Repetit Training Page
 *
 * View all AI-suggested puzzle sets saved from the coach chat.
 * - Shows list of training sets (e.g., "Repetit Training: King Safety")
 * - Progress for each set (10/20 completed, 85% accuracy)
 * - Click to continue practicing
 * - XP and streak stats
 */

import React, { useEffect, useState } from "react";
import {
  getAllTrainingSets,
  getUserStats,
  deleteTrainingSet,
  RepetitTrainingSet,
  UserPuzzleStats,
} from "@/lib/repetitTraining";
import { useRouter } from "next/router";
import { useSetAtom } from "jotai";
import {
  practicePuzzlesAtom,
  currentPuzzleIndexAtom,
  practiceThemeAtom,
} from "@/sections/practice/states";

export default function RepetitTrainingPage() {
  const router = useRouter();
  const [trainingSets, setTrainingSets] = useState<RepetitTrainingSet[]>([]);
  const [userStats, setUserStats] = useState<UserPuzzleStats | null>(null);
  const setPracticePuzzles = useSetAtom(practicePuzzlesAtom);
  const setCurrentPuzzleIndex = useSetAtom(currentPuzzleIndexAtom);
  const setPracticeTheme = useSetAtom(practiceThemeAtom);

  useEffect(() => {
    // Load training sets and stats
    const sets = getAllTrainingSets();
    setTrainingSets(sets);

    const stats = getUserStats("current-user"); // TODO: Replace with actual user ID
    setUserStats(stats);
  }, []);

  const handleContinueTraining = (set: RepetitTrainingSet) => {
    // Load puzzles into practice mode
    setPracticePuzzles(set.puzzles);

    // Start from first unsolved puzzle
    const firstUnsolvedIndex = set.puzzles.findIndex(
      (p) => !set.completedPuzzleIds.includes(p.id)
    );
    setCurrentPuzzleIndex(firstUnsolvedIndex >= 0 ? firstUnsolvedIndex : 0);
    setPracticeTheme(set.theme);

    router.push({
      pathname: "/practice",
      query: {
        theme: set.theme,
        setId: set.id,
      },
    });
  };

  const handleDeleteSet = (setId: string) => {
    if (confirm("Delete this training set? Your progress will be lost.")) {
      deleteTrainingSet(setId);
      setTrainingSets(getAllTrainingSets());
    }
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #1e1e2e 0%, #2a2a3e 100%)",
      color: "#fff",
      padding: "2rem",
    }}>
      <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
        {/* Header */}
        <div style={{ marginBottom: "2rem" }}>
          <h1 style={{
            fontSize: "2.5rem",
            fontWeight: 700,
            marginBottom: "0.5rem",
            background: "linear-gradient(135deg, #4CAF50, #8BC34A)",
            WebkitBackgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}>
            🎯 Repetit Training
          </h1>
          <p style={{ color: "#b0b0c0", fontSize: "1.1rem" }}>
            AI-suggested puzzle sets to strengthen your tactical vision
          </p>
        </div>

        {/* User Stats Card */}
        {userStats && (
          <div style={{
            background: "linear-gradient(135deg, #2d2d3f 0%, #3a3a4f 100%)",
            borderRadius: "16px",
            padding: "1.5rem",
            marginBottom: "2rem",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
            gap: "1.5rem",
          }}>
            <StatCard label="Total Solved" value={userStats.totalSolved} />
            <StatCard label="Accuracy" value={`${userStats.accuracy}%`} />
            <StatCard label="XP" value={userStats.xp} />
            <StatCard label="Current Streak" value={`${userStats.currentStreak} days`} />
            <StatCard label="Longest Streak" value={`${userStats.longestStreak} days`} />
          </div>
        )}

        {/* Training Sets Grid */}
        {trainingSets.length === 0 ? (
          <div style={{
            textAlign: "center",
            padding: "4rem 2rem",
            background: "#2d2d3f",
            borderRadius: "16px",
          }}>
            <p style={{ fontSize: "1.2rem", color: "#b0b0c0", marginBottom: "1rem" }}>
              No training sets yet
            </p>
            <p style={{ color: "#808090" }}>
              Ask the AI coach to suggest practice puzzles, and they'll appear here!
            </p>
            <button
              onClick={() => router.push("/")}
              style={{
                marginTop: "1.5rem",
                padding: "0.75rem 1.5rem",
                background: "linear-gradient(135deg, #4CAF50, #2E7D32)",
                color: "#fff",
                border: "none",
                borderRadius: "8px",
                fontSize: "1rem",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Go to AI Coach
            </button>
          </div>
        ) : (
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "1.5rem",
          }}>
            {trainingSets
              .sort((a, b) => b.createdAt - a.createdAt) // Newest first
              .map((set) => (
                <TrainingSetCard
                  key={set.id}
                  set={set}
                  onContinue={() => handleContinueTraining(set)}
                  onDelete={() => handleDeleteSet(set.id)}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Components ────────────────────────────────────────────────────────────────

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{
        fontSize: "2rem",
        fontWeight: 700,
        color: "#4CAF50",
        marginBottom: "0.25rem",
      }}>
        {value}
      </div>
      <div style={{ fontSize: "0.9rem", color: "#b0b0c0" }}>
        {label}
      </div>
    </div>
  );
}

function TrainingSetCard({
  set,
  onContinue,
  onDelete,
}: {
  set: RepetitTrainingSet;
  onContinue: () => void;
  onDelete: () => void;
}) {
  const completedCount = set.completedPuzzleIds.length;
  const totalCount = set.puzzles.length;
  const progress = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;
  const isCompleted = completedCount === totalCount && totalCount > 0;

  return (
    <div style={{
      background: "linear-gradient(135deg, #2d2d3f 0%, #3a3a4f 100%)",
      borderRadius: "16px",
      padding: "1.5rem",
      position: "relative",
      border: isCompleted ? "2px solid #4CAF50" : "2px solid transparent",
    }}>
      {/* Completed Badge */}
      {isCompleted && (
        <div style={{
          position: "absolute",
          top: "1rem",
          right: "1rem",
          background: "#4CAF50",
          color: "#fff",
          padding: "0.25rem 0.75rem",
          borderRadius: "12px",
          fontSize: "0.75rem",
          fontWeight: 600,
        }}>
          ✓ COMPLETED
        </div>
      )}

      {/* Title */}
      <h3 style={{
        fontSize: "1.25rem",
        fontWeight: 600,
        marginBottom: "0.5rem",
        color: "#fff",
      }}>
        {set.displayName}
      </h3>

      {/* Meta info */}
      <div style={{ color: "#b0b0c0", fontSize: "0.85rem", marginBottom: "1rem" }}>
        {new Date(set.createdAt).toLocaleDateString()} • {totalCount} puzzles
        {set.difficulty && ` • ${set.difficulty}`}
      </div>

      {/* Progress Bar */}
      <div style={{
        background: "#1e1e2e",
        borderRadius: "8px",
        height: "8px",
        marginBottom: "0.75rem",
        overflow: "hidden",
      }}>
        <div style={{
          background: "linear-gradient(90deg, #4CAF50, #8BC34A)",
          height: "100%",
          width: `${progress}%`,
          transition: "width 0.3s ease",
        }} />
      </div>

      {/* Stats */}
      <div style={{
        display: "flex",
        gap: "1rem",
        marginBottom: "1rem",
        fontSize: "0.9rem",
      }}>
        <div>
          <span style={{ color: "#b0b0c0" }}>Progress: </span>
          <span style={{ color: "#fff", fontWeight: 600 }}>
            {completedCount}/{totalCount}
          </span>
        </div>
        {set.accuracy > 0 && (
          <div>
            <span style={{ color: "#b0b0c0" }}>Accuracy: </span>
            <span style={{ color: set.accuracy >= 80 ? "#4CAF50" : "#FFC107", fontWeight: 600 }}>
              {set.accuracy}%
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.75rem" }}>
        <button
          onClick={onContinue}
          style={{
            flex: 1,
            padding: "0.75rem",
            background: "linear-gradient(135deg, #4CAF50, #2E7D32)",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: "0.95rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          {isCompleted ? "Review" : "Continue"}
        </button>
        <button
          onClick={onDelete}
          style={{
            padding: "0.75rem",
            background: "#3a3a4f",
            color: "#ff4444",
            border: "none",
            borderRadius: "8px",
            fontSize: "0.95rem",
            cursor: "pointer",
          }}
        >
          🗑️
        </button>
      </div>
    </div>
  );
}
