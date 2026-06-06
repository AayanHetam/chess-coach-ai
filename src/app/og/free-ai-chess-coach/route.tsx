import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(_req: NextRequest) {
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

        {/* brand mark */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 40,
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              background: "rgba(255,107,43,0.2)",
              border: "1px solid rgba(255,107,43,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 20,
            }}
          >
            ♟
          </div>
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
            maxWidth: 800,
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
