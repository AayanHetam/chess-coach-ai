import type { Metadata } from "next";
import Link from "next/link";
import { contentPageStyles } from "../_seo/styles";

export const metadata: Metadata = {
  title:
    "Chess Masti AI vs Sensei Chess, Noctie, Chessvia, DecodeChess, Chess.com Coach",
  description:
    "Honest comparison: where Chess Masti AI's engine-first pipeline and 100,000-puzzle Neo4j graph beat the alternatives, and where established players (Chess.com Coach, DecodeChess) are stronger.",
  alternates: { canonical: "https://chessmasti.com/vs" },
  openGraph: {
    title: "Chess Masti AI vs the alternatives",
    description:
      "Comparison against Sensei Chess, Noctie, Chessvia, DecodeChess, Chess.com Coach.",
    url: "https://chessmasti.com/vs",
    type: "article",
    siteName: "Chess Masti AI",
    images: [
      {
        url: "https://chessmasti.com/social-networks-1200x630.png",
        width: 1200,
        height: 630,
        alt: "Chess Masti AI",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@ChessMastiAI",
    creator: "@ChessMastiAI",
    title: "Chess Masti AI vs the alternatives",
    description: "Honest comparison across 5 AI chess coaches.",
    images: ["https://chessmasti.com/social-networks-1200x630.png"],
  },
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    {
      "@type": "ListItem",
      position: 1,
      name: "Home",
      item: "https://chessmasti.com/",
    },
    {
      "@type": "ListItem",
      position: 2,
      name: "Compare",
      item: "https://chessmasti.com/vs",
    },
  ],
};

const COMPARISON_ROWS = [
  ["Free, no paid tier", "Yes", "Freemium", "Freemium", "Freemium", "Paid", "Paid (Diamond)"],
  ["Engine evaluates before the LLM speaks", "Yes (Stockfish 17 WASM)", "Partial", "Engine-driven, no LLM coach", "LLM-led", "Yes (proprietary engine)", "Yes"],
  ["LLM output validated against live board", "Yes (chess.js validator)", "Not publicly documented", "n/a", "Not publicly documented", "n/a", "Partial"],
  ["Humanlike opponent (Maia-style)", "Yes (Maia-2, NeurIPS 2024)", "No", "Yes (their core product)", "No", "No", "Bots feature, not Maia"],
  ["Puzzle library size", "100,000+ in Neo4j graph", "Smaller", "None", "Smaller", "n/a", "Millions (Chess.com archive)"],
  ["FEN-similarity puzzle re-ranking", "Yes (49-d cosine)", "Not publicly documented", "n/a", "Not publicly documented", "n/a", "No"],
  ["Adaptive recommendations from your mistakes", "Yes (graph + cosine)", "Theme-based", "n/a", "Theme-based", "n/a", "Personalized but theme-led"],
  ["Live play in-app", "Yes (Lichess OAuth)", "No", "Yes", "No", "No", "Yes (own platform)"],
  ["Opponent scouting / scout reports", "Yes (Stalker Score, tilt/timeout)", "No", "No", "No", "No", "Limited"],
  ["Inline puzzles inside chat replies", "Yes", "No", "n/a", "No", "n/a", "No"],
];

export default function VsPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: contentPageStyles }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <main className="cm-content">
        <nav className="cm-nav" aria-label="Site navigation">
          <Link href="/">Chess Masti AI</Link>
          <span className="cm-nav-sep">/</span>
          <span>Compare</span>
        </nav>

        <article>
          <header>
            <h1>Chess Masti AI vs other AI chess coaches</h1>
            <p className="cm-lede">
              Five products people compare us with. The honest read on each.
            </p>
          </header>

          <section>
            <h2>At-a-glance</h2>
            <table>
              <thead>
                <tr>
                  <th>Capability</th>
                  <th>Chess Masti AI</th>
                  <th>Sensei Chess</th>
                  <th>Noctie</th>
                  <th>Chessvia</th>
                  <th>DecodeChess</th>
                  <th>Chess.com Coach</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row[0]}>
                    {row.map((cell, i) => (
                      <td key={i}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <section>
            <h2>Where each product is genuinely strong</h2>

            <h3>Chess.com Coach</h3>
            <p>
              Massive scale, established brand, decades of game data,
              integrated platform with millions of opponents and tournaments.
              If you want one product that does everything inside one ecosystem
              and you&apos;re paying anyway, this is the obvious choice. We
              don&apos;t try to compete on platform breadth.
            </p>

            <h3>DecodeChess</h3>
            <p>
              Detailed, narrative engine analysis with extensive variation
              explanation. They&apos;ve been at this longer than almost anyone,
              and their analyses are deep. Their pricing model is paid; ours is
              free. Different tier of customer.
            </p>

            <h3>Noctie</h3>
            <p>
              A focused, well-executed humanlike opponent. If your only goal is
              &quot;play someone who feels human at my level,&quot; Noctie is
              purpose-built for that. We use Maia-2 (the published research
              it&apos;s similar to) for the same reason — but our coaching
              layer is the wedge, the opponent is one of several features.
            </p>

            <h3>Sensei Chess</h3>
            <p>
              A newer entrant in the LLM-coaching space, conversational
              interface, growing feature set. The honest comparison axis is the
              validator: we put a chess.js verifier on every coaching response
              before display. We have no public information about Sensei doing
              the same.
            </p>

            <h3>Chessvia</h3>
            <p>
              Another LLM-led conversational coach. Same comparison axis as
              Sensei.
            </p>
          </section>

          <section>
            <h2>Where Chess Masti AI is the better pick</h2>
            <ol>
              <li>
                <strong>You don&apos;t want to pay.</strong> No tier of ours
                sits behind a wall.
              </li>
              <li>
                <strong>You distrust LLM hallucinations.</strong> Stockfish-first,
                then a separate validator, is unusual in this category.
              </li>
              <li>
                <strong>You want training that matches your mistakes.</strong>{" "}
                FEN cosine re-ranking on top of a 100,000-puzzle Neo4j graph is
                the differentiator.
              </li>
              <li>
                <strong>You want to scout an opponent before a match.</strong>{" "}
                The Stalker Score / tilt-profile dashboard isn&apos;t
                replicated elsewhere.
              </li>
              <li>
                <strong>You&apos;re in India or Southeast Asia.</strong>{" "}
                That&apos;s our priority market and feedback loop.
              </li>
            </ol>
            <p className="cm-footer-note">
              Comparison is best-effort and based on publicly observable
              behaviour at the time of writing. If a competitor ships something
              that closes a gap, we&apos;ll update the page.
            </p>
          </section>

          <nav className="cm-cross-links" aria-label="Related pages">
            <Link href="/how-it-works">
              See how the engine-first pipeline actually works →
            </Link>
            <Link href="/architecture">Architecture deep-dive →</Link>
            <Link href="/faq">Frequently asked questions →</Link>
          </nav>
        </article>
      </main>
    </>
  );
}
