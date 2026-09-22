import { ImageResponse } from "next/og";
import { brandMarkOgDataUri } from "@/lib/og/brand";
import { mastiOgDataUri } from "@/lib/og/masti";

/**
 * The brand share card: what a link to chessmasti.com unfurls into on X,
 * Slack, iMessage and WhatsApp. Masti waves beside the home page's own
 * headline so the preview and the page say the same thing. Every page
 * without a card of its own points here (pageTitle.tsx, app/layout.tsx).
 *
 * Node runtime like the other cards: the still is read from public/ with fs
 * and shipped through outputFileTracingIncludes in next.config.js. An edge
 * function that bundled the PNG went past Vercel's 1 MB cap.
 */
export const runtime = "nodejs";

const EMBER = "#F97316";

export async function GET() {
  const masti = mastiOgDataUri("wave");
  const brand = brandMarkOgDataUri();
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(135deg, #08080f 0%, #12101a 100%)",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        {/* The hero stage's ember halo, behind Masti. */}
        <div
          style={{
            position: "absolute",
            right: 30,
            top: 30,
            width: 580,
            height: 580,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(249,115,22,0.34) 0%, rgba(249,115,22,0.10) 45%, rgba(249,115,22,0) 70%)",
          }}
        />

        {masti && (
          // eslint-disable-next-line @next/next/no-img-element -- satori draws a plain img from a data URI, next/image has no part here
          <img
            src={masti}
            alt=""
            width={448}
            height={560}
            style={{ position: "absolute", right: 64, bottom: 0 }}
          />
        )}

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            width: 660,
            paddingLeft: 88,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 36,
            }}
          >
            {brand && (
              // eslint-disable-next-line @next/next/no-img-element -- satori draws a plain img from a data URI
              <img src={brand} alt="" width={44} height={44} />
            )}
            <span
              style={{
                color: "rgba(255,255,255,0.55)",
                fontSize: 22,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
              }}
            >
              Chess Masti
            </span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontSize: 66,
              fontWeight: 800,
              lineHeight: 1.04,
              letterSpacing: "-0.03em",
            }}
          >
            <span style={{ color: EMBER }}>Meet Masti.</span>
            <span style={{ color: "#ffffff" }}>Chess coaching</span>
            <span style={{ color: "#ffffff" }}>for everyone.</span>
          </div>

          <div
            style={{
              marginTop: 28,
              maxWidth: 520,
              fontSize: 26,
              lineHeight: 1.45,
              color: "rgba(255,255,255,0.62)",
            }}
          >
            Stockfish 17 calculates, Masti explains in plain words, and a
            validator checks every claim. Free.
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
