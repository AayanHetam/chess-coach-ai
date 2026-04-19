import { NextRequest, NextResponse } from "next/server";
import { generatePlayerFeedback } from "@/lib/feedback/generateFeedback";
import { feedbackSchema, validateRequest } from "@/lib/validation/schemas";
import { logger, withRequestContext, extractRequestId } from "@/lib/logging";

const log = logger.child({ module: "feedback" });

export async function POST(request: NextRequest) {
  const requestId = extractRequestId(request.headers);

  return withRequestContext(requestId, async () => {
    try {
      const body = await request.json();

      const parsed = validateRequest(feedbackSchema, body);
      if (!parsed.success) return parsed.response;
      const { username, platform, maxGames } = parsed.data;

      log.info("Feedback generation started", { username, platform, maxGames });

      const feedbackData = await generatePlayerFeedback({
        username,
        platform,
        maxGames,
      });

      log.info("Feedback generation completed", { username, platform });
      return NextResponse.json(feedbackData);
    } catch (error) {
      log.error("Feedback generation failed", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
      });

      const errorMessage =
        error instanceof Error ? error.message : "Unknown error occurred";

      return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
  });
}
