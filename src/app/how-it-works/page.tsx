import type { Metadata } from "next";
import Link from "next/link";
import { contentPageStyles } from "../_seo/styles";

export const metadata: Metadata = {
  title: "How Chess Masti AI Works — engine-first, then the LLM",
  description:
    "Engine-first chess coaching: Stockfish 17 runs first, Claude translates the verdict, a chess.js validator checks every claim before display.",
  alternates: { canonical: "https://chessmasti.com/how-it-works" },
  openGraph: {
    title: "How Chess Masti AI Works",
    description:
      "Engine-first chess coaching pipeline: Stockfish, then Claude, then a validator, then targeted puzzles.",
    url: "https://chessmasti.com/how-it-works",
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
    title: "How Chess Masti AI Works",
    description:
      "Engine-first chess coaching: Stockfish → Claude → validator → puzzles.",
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
      name: "How it works",
      item: "https://chessmasti.com/how-it-works",
    },
  ],
};

const howToJsonLd = {
  "@context": "https://schema.org",
  "@type": "HowTo",
  name: "How Chess Masti AI coaches your chess game",
  description:
    "The engine-first pipeline: Stockfish 17 evaluates, Claude paraphrases, a chess.js validator checks every claim, then targeted puzzles drill the pattern you missed.",
  totalTime: "PT30S",
  step: [
    {
      "@type": "HowToStep",
      position: 1,
      name: "Stockfish 17 evaluates the position",
      text: "When you load a game, Stockfish 17 runs in your browser as a WebAssembly worker — no server round-trip, no rate limit. For each move it produces an evaluation, the best continuation, the next-best alternatives, tactical motif detection, candidate-move gap analysis, and branch-point analysis. The LLM never sees the bare position; it sees the engine's structured verdict.",
      url: "https://chessmasti.com/how-it-works#engine",
    },
    {
      "@type": "HowToStep",
      position: 2,
      name: "Claude turns the verdict into language",
      text: "Claude Sonnet handles deep multi-paragraph analysis given the engine output and your historical context. Claude Haiku handles follow-up chat with sub-5-second responses, using a server-side context cache so subsequent questions don't repay the full token cost. The system prompt is explicit: never invent a chess fact; if the engine didn't say it, don't write it.",
      url: "https://chessmasti.com/how-it-works#claude",
    },
    {
      "@type": "HowToStep",
      position: 3,
      name: "The hallucination validator checks every claim",
      text: "Before any coaching response renders, a validator parses it for every reference to a piece, square, or move, and checks each one against the live chess.js board state. Claims that don't match the position are rewritten or dropped. This is the layer most AI coaches don't have.",
      url: "https://chessmasti.com/how-it-works#validator",
    },
    {
      "@type": "HowToStep",
      position: 4,
      name: "Targeted puzzles drill the pattern you missed",
      text: "Three puzzles render directly inside the coaching message, pulled from a Neo4j graph of 100,000+ Lichess puzzles via graph traversal across your skill band × the relevant tactical theme, then re-ranked by 49-dimensional FEN cosine similarity to the position you just lost. You train on the geometry of your specific mistake.",
      url: "https://chessmasti.com/how-it-works#puzzles",
    },
  ],
};

export default function HowItWorksPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: contentPageStyles }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(howToJsonLd) }}
      />
      <main className="cm-content">
        <nav className="cm-nav" aria-label="Site navigation">
          <Link href="/">Chess Masti AI</Link>
          <span className="cm-nav-sep">/</span>
          <span>How it works</span>
        </nav>

        <article>
          <header>
            <h1>How Chess Masti AI works</h1>
            <p className="cm-lede">
              Most &quot;AI chess coaches&quot; are an LLM with a board diagram
              pasted into the prompt. They hallucinate. They invent moves that
              aren&apos;t legal in the position. They confidently misidentify
              pieces. They tell you the rook on f1 is hanging when there&apos;s
              no rook on f1.
            </p>
            <p>
              Chess Masti AI is built the other way around. The engine runs
              first. The LLM only ever paraphrases what the engine already
              said. Then a separate validator checks the paraphrase against the
              actual board before you read it.
            </p>
          </header>

          <section id="engine">
            <h2>1. The engine runs first</h2>
            <p>
              When you load a game,{" "}
              <strong>Stockfish 17</strong> runs in your browser as a
              WebAssembly worker — no server round-trip, no rate limit. For
              each move the engine produces an evaluation, the best
              continuation, and the next-best alternatives. We layer three more
              passes on top of the raw eval:
            </p>
            <ul>
              <li>
                <strong>Tactical motif detection</strong>: pins, forks, skewers,
                discovered attacks, back-rank patterns.
              </li>
              <li>
                <strong>Candidate-move gap analysis</strong>: how big was the
                gap between the move you played and Stockfish&apos;s
                recommendation, and was the recommendation a single forcing
                line or a quiet positional choice?
              </li>
              <li>
                <strong>Branch-point analysis</strong>: was this move the
                position&apos;s pivot — where the game&apos;s evaluation
                decisively turned?
              </li>
            </ul>
            <p>
              The LLM never sees the bare position. It sees the engine&apos;s
              structured verdict.
            </p>
          </section>

          <section id="claude">
            <h2>2. Claude turns the verdict into language</h2>
            <p>Two models, picked by latency budget:</p>
            <ul>
              <li>
                <strong>Claude Sonnet</strong> (Anthropic) handles deep,
                multi-paragraph analysis. It receives the engine output and
                your historical context — playing style, study goals, favourite
                openings — and writes the coaching response.
              </li>
              <li>
                <strong>Claude Haiku</strong> handles follow-up chat with
                sub-5-second responses. The first analysis call seeds a
                server-side context cache keyed by{" "}
                <code>contextId</code>, so subsequent questions don&apos;t
                repay the full token cost.
              </li>
            </ul>
            <p>
              The system prompt makes one thing explicit: never invent a chess
              fact. If the engine didn&apos;t say it, don&apos;t write it.
            </p>
          </section>

          <section id="validator">
            <h2>3. The hallucination validator</h2>
            <p>
              LLMs still drift. So before any coaching response renders, a{" "}
              <strong>hallucination validator</strong> parses it for every
              reference to a piece, square, or move, and checks each one
              against the live <code>chess.js</code> board state.
            </p>
            <p>
              If the response says &quot;the bishop on c4 attacks h7,&quot; the
              validator confirms there is a bishop on c4 and that h7 is on its
              diagonal. If the response suggests <code>Nxe5</code> as a
              candidate, the validator confirms that a knight legally moves to
              e5 in the current position. Claims that don&apos;t check out are
              rewritten or dropped.
            </p>
            <p>
              This is the layer most &quot;AI coaches&quot; don&apos;t have.
              It&apos;s also the reason you can trust the output enough to act
              on it during a game.
            </p>
          </section>

          <section id="puzzles">
            <h2>4. Targeted training, inline</h2>
            <p>
              A coaching response that just explains your mistake is half the
              loop. The other half is doing more reps on positions like the one
              you just got wrong.
            </p>
            <p>
              So three puzzles render directly inside the coaching message —
              same chat bubble, same chess board, no tab switch. They&apos;re
              pulled from a{" "}
              <strong>Neo4j graph of 100,000+ Lichess puzzles</strong> filtered
              to popularity ≥ 60, plays ≥ 50, rating deviation ≤ 120. Retrieval
              is a graph traversal (your skill band × the relevant tactical
              theme), then a 49-dimensional FEN cosine-similarity re-ranking
              against the FEN you just lost. You train on the geometry of your
              specific mistake, not a generic &quot;back-rank tactics&quot;
              bucket.
            </p>
            <p>
              Solve them, the SM-2 spaced-repetition scheduler files them away,
              and the next time a similar shape comes up the loop is shorter.
            </p>
          </section>

          <section>
            <h2>5. The rest of the surface</h2>
            <ul>
              <li>
                <strong>Twin Bot</strong> runs on{" "}
                <strong>Maia-2</strong> (NeurIPS 2024), a neural network
                trained to predict human moves at a target Elo. Optionally
                seeded with a public Lichess player&apos;s opening repertoire.
              </li>
              <li>
                <strong>Live play</strong> uses Lichess OAuth 2.0 PKCE with
                dual-SSE streams.
              </li>
              <li>
                <strong>Opponent scouting</strong> ingests a Lichess or
                Chess.com username and returns opening trees, repertoire
                collisions, a Stalker Score exploitability index, tilt and
                timeout psychology profiles, and a shareable SVG card.
              </li>
            </ul>
          </section>

          <hr />

          <p className="cm-footer-note">
            No paid tier. Built and maintained by Aayan Hetamsaria. India and
            Southeast Asia first.
          </p>

          <nav className="cm-cross-links" aria-label="Related pages">
            <Link href="/architecture">Read the architecture deep-dive →</Link>
            <Link href="/vs">Compare with other AI chess coaches →</Link>
            <Link href="/faq">Frequently asked questions →</Link>
          </nav>
        </article>
      </main>
    </>
  );
}
