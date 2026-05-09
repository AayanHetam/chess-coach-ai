import type { Metadata } from "next";
import Link from "next/link";
import { contentPageStyles } from "../_seo/styles";

export const metadata: Metadata = {
  title: "Chess Masti AI — architecture (Stockfish 17, Claude, Maia-2, Neo4j)",
  description:
    "How the system is built: Next.js 15 on Vercel, Stockfish 17 WASM in-browser, two-tier Anthropic Claude with context caching, Maia-2 microservice on Hugging Face, hallucination validator, Neo4j Aura graph with FEN cosine re-ranking.",
  alternates: { canonical: "https://chessmasti.com/architecture" },
  openGraph: {
    title: "Chess Masti AI architecture",
    description:
      "Stockfish 17 WASM, two-tier Claude, Maia-2, Neo4j with FEN cosine re-ranking, hallucination validator.",
    url: "https://chessmasti.com/architecture",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "Chess Masti AI architecture",
    description: "Engineering deep-dive on the chess coaching pipeline.",
  },
};

const techArticleJsonLd = {
  "@context": "https://schema.org",
  "@type": "TechArticle",
  headline: "Chess Masti AI architecture",
  description:
    "Engineering description of the chess coaching pipeline: Stockfish 17 WASM, two-tier Claude, Maia-2, hallucination validator, Neo4j with FEN cosine re-ranking.",
  author: { "@type": "Person", name: "Aayan Hetamsaria" },
  url: "https://chessmasti.com/architecture",
  mainEntityOfPage: "https://chessmasti.com/architecture",
};

const breadcrumbJsonLd = {
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  itemListElement: [
    { "@type": "ListItem", position: 1, name: "Home", item: "https://chessmasti.com/" },
    {
      "@type": "ListItem",
      position: 2,
      name: "Architecture",
      item: "https://chessmasti.com/architecture",
    },
  ],
};

export default function ArchitecturePage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: contentPageStyles }} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(techArticleJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <main className="cm-content">
        <nav className="cm-nav" aria-label="Site navigation">
          <Link href="/">Chess Masti AI</Link>
          <span className="cm-nav-sep">/</span>
          <span>Architecture</span>
        </nav>

        <article>
          <header>
            <h1>Architecture</h1>
            <p className="cm-lede">
              Chess Masti AI is built around one mental model: every chess fact
              in a coaching response must be derivable from an authoritative
              source, not from the LLM&apos;s parameters. This page walks
              through the pieces that enforce that.
            </p>
          </header>

          <section>
            <h2>Application layer</h2>
            <p>
              Next.js 15 (App Router for API + new content surfaces, Pages
              Router for legacy interactive pages), TypeScript, deployed on
              Vercel. Sentry for error monitoring. Auth is a signed JWT in an
              httpOnly cookie (<code>cm_session</code>); email/password uses
              bcrypt; Google OAuth is server-routed through chessmasti.com so
              the browser never hits Firebase domains directly.
            </p>
            <p>Persistence is split across three layers:</p>
            <ul>
              <li>
                <strong>Firestore</strong> (server-side, via Firebase Admin
                SDK) for user accounts, saved games, and the openings
                repertoire.
              </li>
              <li>
                <strong>IndexedDB</strong> (browser, via <code>idb</code>) for
                puzzle progress and SM-2 spaced-repetition state.
              </li>
              <li>
                <strong>Neo4j Aura</strong> for the puzzle graph (described
                below).
              </li>
            </ul>
          </section>

          <section>
            <h2>Engine layer (in-browser)</h2>
            <p>
              <strong>Stockfish 17</strong> ships as a WebAssembly worker. It
              evaluates positions on your machine, not on our servers, which
              means no rate limit, no quota, and no privacy concern about your
              game data leaving the browser for analysis. We layer three
              structured passes on top of raw eval output:
            </p>
            <ol>
              <li>
                <strong>Tactical motif detection</strong> — pins, forks,
                skewers, discovered attacks, back-rank patterns, deflections.
              </li>
              <li>
                <strong>Candidate-move gap analysis</strong> — how large was
                the eval gap between the move played and Stockfish&apos;s
                preferred line, and was the preferred line forcing or quiet?
              </li>
              <li>
                <strong>Branch-point analysis</strong> — was this move the
                position&apos;s decision pivot?
              </li>
            </ol>
            <p>
              The LLM is never given the raw board. It receives a structured
              digest from this layer.
            </p>
          </section>

          <section>
            <h2>LLM layer (server-side)</h2>
            <p>Two tiers, selected by latency budget:</p>
            <ul>
              <li>
                <strong>Flagship: Claude Sonnet.</strong> Deep multi-section
                game analysis. Used by <code>/api/enhanced-analysis</code>.
              </li>
              <li>
                <strong>Fast: Claude Haiku.</strong> Sub-5-second follow-up
                chat. Used by <code>/api/chat</code>. The flagship analysis
                call writes a server-side context cache keyed by{" "}
                <code>contextId</code>; subsequent fast-tier calls hit that
                cache instead of reconstructing from scratch.
              </li>
            </ul>
            <p>
              Every server-side LLM call funnels through a single{" "}
              <code>callLLM(tier)</code> function. Callsites pass a tier (
              <code>&quot;flagship&quot; | &quot;fast&quot;</code>), never a
              model name — that boundary is what makes model upgrades safe.
            </p>
            <p>
              The system prompt is centralized and versioned (
              <code>PROMPT_VERSION</code>), so before/after evals on coaching
              quality are reproducible.
            </p>
          </section>

          <section>
            <h2>Validator layer</h2>
            <p>
              The piece that most &quot;AI chess coach&quot; products skip.
              After the LLM returns and before the response renders, a
              validator:
            </p>
            <ol>
              <li>
                Parses the response for every piece reference (e.g. &quot;the
                rook on f1&quot;), square reference (e.g. &quot;control of
                d4&quot;), and SAN move (e.g. &quot;11. d5!&quot;).
              </li>
              <li>
                Loads the live <code>chess.js</code> board state for the
                position the user is asking about.
              </li>
              <li>
                Checks each claim. Is there a rook on f1? Is d5 a legal move in
                this position? Does the bishop on c4 actually attack h7?
              </li>
              <li>Discards or rewrites claims that don&apos;t check out.</li>
            </ol>
            <p>
              The validator runs unconditionally. It is the reason coaching
              output is safe to act on during a game.
            </p>
          </section>

          <section>
            <h2>Maia-2 microservice</h2>
            <p>
              Twin Bot uses <strong>Maia-2</strong> (NeurIPS 2024), a neural
              network trained on Lichess data to predict human moves at a
              target Elo. We don&apos;t run the model in our application
              backend — it lives as a FastAPI/PyTorch microservice on Hugging
              Face Spaces, called via an API proxy from Vercel. A daily cron
              pings the Hugging Face endpoint to keep it warm. Twin Bot can
              optionally be seeded with a public Lichess username&apos;s
              opening tree so the bot mirrors a specific player&apos;s
              repertoire as well as their target rating.
            </p>
          </section>

          <section>
            <h2>Retrieval layer (Neo4j)</h2>
            <p>
              The puzzle graph in <strong>Neo4j Aura</strong> holds 100,000+
              Lichess puzzles, filtered by quality (popularity ≥ 60, plays ≥
              50, rating deviation ≤ 120) and structured across 46 tactical
              themes and 4 difficulty bands. We join in 298,000+ commentary
              pairs from the Jhamtani expert-commentary dataset.
            </p>
            <p>Recommendation is a two-stage process:</p>
            <ol>
              <li>
                <strong>Graph traversal.</strong> Given the user&apos;s skill
                band, the tactical theme of their mistake, and their recent
                solve history, traverse the graph to find candidate puzzles in
                the right band and theme.
              </li>
              <li>
                <strong>49-dimensional FEN cosine-similarity re-ranking.</strong>{" "}
                Project the FEN of the position the user just lost into a
                49-dimensional vector, project each candidate puzzle&apos;s
                start FEN into the same space, rank by cosine similarity,
                return the top 3.
              </li>
            </ol>
            <p>
              The output: training that matches the geometry of your mistake,
              not just its category.
            </p>
          </section>

          <section>
            <h2>Live play</h2>
            <p>
              Lichess OAuth 2.0 PKCE for sign-in. Dual-SSE streams (one for the
              game, one for board events) mirror the Lichess live game into
              the app, so you can analyse, chat with the coach, and play in the
              same surface.
            </p>
          </section>

          <section>
            <h2>Things we don&apos;t do</h2>
            <p>
              No paid tier. No advertising. No selling game data. No fine-tuned
              proprietary chess LLM (a fine-tuned LLM still hallucinates; the
              validator is what we trust).
            </p>
          </section>

          <nav className="cm-cross-links" aria-label="Related pages">
            <Link href="/how-it-works">
              Read the user-facing pipeline overview →
            </Link>
            <Link href="/vs">Compare with other AI chess coaches →</Link>
            <Link href="/faq">Frequently asked questions →</Link>
          </nav>
        </article>
      </main>
    </>
  );
}
