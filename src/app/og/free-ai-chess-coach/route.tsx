import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";
import { brandMarkOgDataUri } from "@/lib/og/brand";
import { mastiOgDataUri } from "@/lib/og/masti";

/**
 * Node runtime, like the other three OG cards: Masti's still is read from
 * public/ with fs and listed in next.config.js outputFileTracingIncludes so
 * it ships with the function. This card used to run on the edge and bundle
 * the PNG with fetch(new URL(..., import.meta.url)), which took the function
 * from 0.96 MB to 1.06 MB compressed, past Vercel's 1 MB edge limit, and
 * failed every deploy of the branch after the build had passed.
 */
export const runtime = "nodejs";

export async function GET(_req: NextRequest) {
  const masti = mastiOgDataUri("wave");
  const brand = brandMarkOgDataUri();
  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 100px",
          background: "linear-gradient(135deg, #08080f 0%, #12101a 100%)",
          fontFamily: "system-ui, sans-serif",
          position: "relative",
        }}
      >
        {/* subtle amber glow top-right */}
        <div
          style={{
            position: "absolute",
            top: -80,
            right: -80,
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255,107,43,0.18) 0%, transparent 70%)",
          }}
        />

        {/* Masti, waving from the free right half. */}
        {masti && (
          <img
            src={masti}
            alt=""
            width={288}
            height={360}
            style={{ position: "absolute", right: 40, bottom: 0 }}
          />
        )}

        {/* brand mark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 40,
          }}
        >
          {brand && (
            // eslint-disable-next-line @next/next/no-img-element -- satori draws a plain img from a data URI
            <img src={brand} alt="" width={40} height={40} />
          )}
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 20, letterSpacing: "0.04em" }}>
            chessmasti.com
          </span>
        </div>

        {/* headline */}
        <div
          style={{
            fontSize: 72,
            fontWeight: 800,
            color: "#ffffff",
            lineHeight: 1.05,
            letterSpacing: "-0.02em",
            marginBottom: 28,
          }}
        >
          Free AI Chess Coach
        </div>

        {/* sub */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            fontSize: 28,
            color: "rgba(255,255,255,0.55)",
            lineHeight: 1.5,
            maxWidth: 700,
          }}
        >
          <span>Stockfish analysis.</span>
          <span style={{ color: "rgba(255,107,43,0.9)" }}>Claude explanations.</span>
          <span>Mistake-based drills.</span>
          <span>Free.</span>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
