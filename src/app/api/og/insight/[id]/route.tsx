import { ImageResponse } from "next/og";
import { getInsight } from "@/lib/insights";
import { excerptCoachContent } from "@/lib/og/excerptCoachContent";

export const runtime = "nodejs";

// 1200×630 is the canonical Twitter / OG card aspect. Most clients
// (Twitter, LinkedIn, Discord, Slack) reflow it correctly at 2:1.
const CARD_W = 1200;
const CARD_H = 630;

const BG = "#0B0F19";          // Obsidian Glass background
const FG = "#F1F5F9";          // primary text
const MUTED = "#94A3B8";       // secondary text
const EMBER = "#F97316";       // brand accent (Ember Core)
const EDGE = "rgba(255,255,255,0.08)";

/**
 * Server-rendered OG image for a saved coach insight. Linked from the
 * /analysis?insightId=N getServerSideProps OG meta — every share unfurl
 * (Twitter, Discord, Slack, LinkedIn, …) fetches THIS endpoint as the
 * og:image and the card below is what appears in the preview.
 *
 * v1 is typography-forward: no chess board render. Rendering an actual
 * board through Satori requires shipping piece SVGs + a fen→layout
 * pipeline, which is a bigger project. The text-card approach still
 * looks polished and conveys the insight, which is the point.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  // Default card for "not found / malformed" — still returns a 200
  // (crawlers cache 4xx responses harshly and we'd rather show a brand
  // card than an empty unfurl if the insight expired).
  let coachExcerpt =
    "An AI chess coach that explains every move like a real coach — no hallucinations.";
  let fenLabel = "chessmasti.com";

  if (id && typeof id === "string" && id.length <= 64) {
    try {
      const insight = await getInsight(id);
      if (insight) {
        coachExcerpt = excerptCoachContent(insight.coachContent, 220) ||
          coachExcerpt;
        // Just show the move-side indicator from the FEN; the full FEN
        // is noisy and we're not rendering a board.
        const fenParts = insight.fen?.trim().split(" ") ?? [];
        const sideToMove = fenParts[1] === "b" ? "Black to move" : "White to move";
        const fullMove = fenParts[5] ? `, move ${fenParts[5]}` : "";
        fenLabel = `${sideToMove}${fullMove}`;
      }
    } catch (err) {
      // Brand-card fallback on any read failure (Firestore down, etc.).
      console.error("[og/insight] insight read failed for", id, err);
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          backgroundColor: BG,
          backgroundImage: `radial-gradient(circle at 85% 15%, rgba(249,115,22,0.22) 0%, rgba(249,115,22,0) 55%), radial-gradient(circle at 12% 85%, rgba(56,189,248,0.10) 0%, rgba(56,189,248,0) 50%)`,
          padding: 64,
          color: FG,
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* Header row: brand mark + small badge */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 36,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 10,
                backgroundColor: EMBER,
                color: BG,
                fontSize: 28,
                fontWeight: 800,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              ♞
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                lineHeight: 1.1,
              }}
            >
              <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: -0.4 }}>
                Chess Masti
              </span>
              <span style={{ fontSize: 14, color: MUTED, letterSpacing: 1.5 }}>
                COACH INSIGHT
              </span>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              padding: "8px 14px",
              borderRadius: 999,
              border: `1px solid ${EDGE}`,
              color: MUTED,
              fontSize: 16,
              backgroundColor: "rgba(255,255,255,0.04)",
            }}
          >
            {fenLabel}
          </div>
        </div>

        {/* Quote — the meat of the card */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              fontSize: 16,
              color: EMBER,
              letterSpacing: 2,
              fontWeight: 700,
              marginBottom: 18,
            }}
          >
            COACH SAID —
          </div>
          <div
            style={{
              fontSize: 42,
              lineHeight: 1.25,
              fontWeight: 600,
              letterSpacing: -0.5,
              color: FG,
              // Cap height to keep tall excerpts from overflowing the card.
              maxHeight: 360,
              overflow: "hidden",
              display: "flex",
            }}
          >
            “{coachExcerpt}”
          </div>
        </div>

        {/* Footer row */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: 28,
            paddingTop: 24,
            borderTop: `1px solid ${EDGE}`,
            color: MUTED,
            fontSize: 18,
          }}
        >
          <span>Open this position in the AI coach →</span>
          <span style={{ color: FG, fontWeight: 600 }}>chessmasti.com</span>
        </div>
      </div>
    ),
    {
      width: CARD_W,
      height: CARD_H,
      // Cache for 1h at the edge; insight content is immutable so even
      // longer would be safe. Browsers / unfurl clients usually cache
      // their own copy anyway.
      headers: {
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    },
  );
}
