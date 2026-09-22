import type { Metadata } from "next";
import Link from "next/link";
import { Masti } from "@/components/masti";

/**
 * The site's 404. In a mixed Pages + App Router app the App Router's
 * not-found serves every unmatched URL, so this is the one that renders (a
 * pages/404.tsx never would). It sits inside app/layout.tsx, whose content
 * pages are the light-palette SEO articles, so the styling matches those
 * rather than the dark product chrome.
 */

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

const button = (primary: boolean): React.CSSProperties => ({
  display: "inline-block",
  padding: "11px 22px",
  borderRadius: 999,
  fontWeight: 700,
  fontSize: "0.95rem",
  textDecoration: "none",
  background: primary ? "#F97316" : "transparent",
  color: primary ? "#0A0A0A" : "#1a1a2e",
  border: primary ? "1px solid #F97316" : "1px solid rgba(26,26,46,0.25)",
});

export default function NotFound() {
  return (
    <main
      style={{
        maxWidth: 640,
        margin: "0 auto",
        padding: "64px 20px 96px",
        textAlign: "center",
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Roboto, "Helvetica Neue", Arial, sans-serif',
        color: "#1a1a2e",
      }}
    >
      <Masti
        mood="defeated"
        size={180}
        loops={2}
        label="Masti the Monkey, dizzy after walking into a missing page"
      />
      <h1
        style={{
          margin: "20px 0 8px",
          fontSize: "2rem",
          lineHeight: 1.15,
          letterSpacing: "-0.02em",
        }}
      >
        That square is off the board.
      </h1>
      <p
        style={{
          margin: "0 0 28px",
          fontSize: "1.05rem",
          lineHeight: 1.6,
          color: "#444",
        }}
      >
        The page you asked for does not exist, or it moved. Masti checked
        twice.
      </p>
      <nav
        aria-label="Ways back"
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 12,
        }}
      >
        <Link href="/" style={button(true)}>
          Back home
        </Link>
        <Link href="/puzzles" style={button(false)}>
          Solve a puzzle
        </Link>
        <Link href="/analysis" style={button(false)}>
          Analyze a game
        </Link>
      </nav>
    </main>
  );
}
