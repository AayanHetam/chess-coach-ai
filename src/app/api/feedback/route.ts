import { NextRequest, NextResponse } from "next/server";
import { generatePlayerFeedback } from "@/lib/feedback/generateFeedback";

export async function POST(request: NextRequest) {
  try {
    console.log("Feedback API called");
    const body = await request.json();
    const { username, platform, maxGames = 25 } = body;

    console.log("Request data:", { username, platform, maxGames });

    if (!username || !platform) {
      return NextResponse.json(
        { error: "Username and platform are required" },
        { status: 400 }
      );
    }

    if (!["lichess", "chesscom"].includes(platform)) {
      return NextResponse.json(
        { error: "Platform must be either 'lichess' or 'chesscom'" },
        { status: 400 }
      );
    }

    console.log("Starting feedback generation for:", username, "on", platform);
    const feedbackData = await generatePlayerFeedback({
      username,
      platform,
      maxGames,
    });

    console.log("Feedback generation completed successfully");
    return NextResponse.json(feedbackData);
  } catch (error) {
    console.error("Error generating feedback:", error);
    console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace");
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
} 