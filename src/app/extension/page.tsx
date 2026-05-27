import type { Metadata } from "next";
import Link from "next/link";
import { contentPageStyles } from "../_seo/styles";

export const metadata: Metadata = {
  title: "Chess Masti AI — Chrome Extension",
  description:
    "One-click chess coaching for your Lichess and Chess.com games. The 'Analyze with Chess Masti' Chrome extension drops a button into the top nav and opens the AI coach with your PGN already loaded.",
  alternates: { canonical: "https://chessmasti.com/extension" },
  openGraph: {
    title: "Chess Masti AI — Chrome Extension",
    description:
      "Add an Analyze button to Lichess and Chess.com. One click opens the AI coach.",
    url: "https://chessmasti.com/extension",
    type: "article",
    siteName: "Chess Masti AI",
    images: [
      {
        url: "https://chessmasti.com/extension/2-lichess-button.png",
        width: 1280,
        height: 800,
        alt: "Analyze with Chess Masti button on Lichess",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    site: "@ChessMastiAI",
    creator: "@ChessMastiAI",
    title: "Chess Masti AI — Chrome Extension",
    description: "One-click chess coaching for your Lichess + Chess.com games.",
    images: ["https://chessmasti.com/extension/2-lichess-button.png"],
  },
};

// Read from env so we can flip on the real Chrome Web Store URL post-approval
// without a code change — set NEXT_PUBLIC_EXTENSION_STORE_URL in Vercel and
// redeploy. Empty/unset = the page renders a "review pending" disabled state.
const STORE_URL = process.env.NEXT_PUBLIC_EXTENSION_STORE_URL ?? "";

const extraStyles = `
.cm-content {
  max-width: 920px;
}
.cm-install-card {
  background: linear-gradient(135deg, #FF8C42 0%, #FF6B35 100%);
  color: #fff;
  border-radius: 16px;
  padding: 40px 36px;
  margin: 2em 0 2.4em;
  box-shadow: 0 18px 40px rgba(255, 107, 53, 0.32);
}
.cm-install-card h2 {
  color: #fff;
  margin: 0 0 0.4em;
  font-size: 1.7rem;
  letter-spacing: -0.01em;
}
.cm-install-card p {
  color: #fff;
  opacity: 0.95;
  font-size: 1.05rem;
  margin: 0 0 1.4em;
}
.cm-install-cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: #fff;
  color: #FF6B35;
  font-weight: 700;
  font-size: 1rem;
  padding: 14px 28px;
  border-radius: 999px;
  text-decoration: none;
  letter-spacing: 0.01em;
  transition: transform 0.12s ease, box-shadow 0.12s ease;
}
.cm-install-cta:hover {
  transform: translateY(-1px);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.18);
  color: #FF6B35;
}
.cm-install-cta.cm-disabled {
  background: rgba(255, 255, 255, 0.5);
  color: #fff;
  pointer-events: none;
  cursor: default;
}
.cm-install-note {
  margin-top: 12px;
  font-size: 0.88rem;
  opacity: 0.85;
}
.cm-shotgrid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
  gap: 18px;
  margin: 1.6em 0 2em;
}
.cm-shotgrid figure {
  margin: 0;
}
.cm-shotgrid img {
  width: 100%;
  height: auto;
  display: block;
  border-radius: 12px;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
  border: 1px solid rgba(0, 0, 0, 0.06);
}
.cm-shotgrid figcaption {
  font-size: 0.92rem;
  color: #555;
  margin-top: 8px;
  line-height: 1.45;
}
.cm-steps {
  list-style: none;
  padding: 0;
  margin: 1em 0 2em;
  counter-reset: step;
}
.cm-steps li {
  counter-increment: step;
  position: relative;
  padding: 14px 0 14px 56px;
  border-bottom: 1px solid #eee;
  font-size: 1.05rem;
}
.cm-steps li:last-child {
  border-bottom: none;
}
.cm-steps li::before {
  content: counter(step);
  position: absolute;
  left: 0;
  top: 14px;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #FF6B35;
  color: #fff;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}
`;

function InstallCTA() {
  if (STORE_URL) {
    return (
      <div className="cm-install-card">
        <h2>Install the Chrome extension</h2>
        <p>
          Add a one-click Analyze button to every Lichess and Chess.com game
          page. Free. No account. Works on Chrome, Edge, Brave, and any other
          Chromium browser.
        </p>
        <a
          className="cm-install-cta"
          href={STORE_URL}
          target="_blank"
          rel="noopener noreferrer"
        >
          ♟ Install from the Chrome Web Store →
        </a>
      </div>
    );
  }
  return (
    <div className="cm-install-card">
      <h2>Coming to the Chrome Web Store</h2>
      <p>
        We&apos;ve submitted the &quot;Analyze with Chess Masti&quot; extension
        and it&apos;s in review. First-time reviews can take a few days to a
        couple of weeks. Check back, or follow{" "}
        <a
          href="https://twitter.com/ChessMastiAI"
          style={{ color: "#fff", textDecoration: "underline" }}
        >
          @ChessMastiAI
        </a>{" "}
        — we&apos;ll post the install link the moment review approves.
      </p>
      <span className="cm-install-cta cm-disabled">
        ♟ Install — review pending
      </span>
    </div>
  );
}

export default function ExtensionPage() {
  return (
    <>
      <style
        dangerouslySetInnerHTML={{
          __html: contentPageStyles + extraStyles,
        }}
      />
      <main className="cm-content">
        <nav className="cm-nav" aria-label="Site navigation">
          <Link href="/">Chess Masti AI</Link>
          <span className="cm-nav-sep">/</span>
          <span>Chrome Extension</span>
        </nav>

        <article>
          <header>
            <h1>Analyze with Chess Masti — the Chrome extension</h1>
            <p className="cm-lede">
              One orange button, dropped into the top navigation of every
              Lichess and Chess.com game page. Click it. Your PGN comes with
              you to chessmasti.com and the AI coach is already talking. No
              copy-paste, no upload, no account.
            </p>
          </header>

          <InstallCTA />

          <section>
            <h2>What you get</h2>
            <p>
              The whole point of the extension is to kill the friction between
              finishing a game and reviewing it. Right now, you finish a game
              on Lichess or Chess.com and the &quot;Rematch&quot; button is
              right there. So you click it. The blunder dies undiagnosed.
            </p>
            <p>
              With the extension installed, a single orange{" "}
              <strong>♟ Analyze with Chess Masti</strong> button sits in the top
              nav of every game page. Click it and a new tab opens at
              chessmasti.com with your PGN already loaded. Stockfish 17
              evaluates in your browser; the AI coach starts a real conversation
              about your moves; the hallucination validator double-checks every
              claim. It&apos;s the post-mortem you keep meaning to do, in one
              click.
            </p>
          </section>

          <section>
            <h2>See it on both sites</h2>
            <div className="cm-shotgrid">
              <figure>
                <img
                  src="/extension/2-lichess-button.png"
                  alt="Analyze with Chess Masti button visible in the Lichess top navigation"
                />
                <figcaption>
                  On <strong>Lichess</strong>, the button sits in the top nav
                  between Donate and the search icon.
                </figcaption>
              </figure>
              <figure>
                <img
                  src="/extension/3-chesscom-button.png"
                  alt="Analyze with Chess Masti button visible on a Chess.com game page"
                />
                <figcaption>
                  On <strong>Chess.com</strong>, the same button slots into the
                  equivalent top-nav position.
                </figcaption>
              </figure>
              <figure>
                <img
                  src="/extension/4-chessmasti-analyzing.png"
                  alt="chessmasti.com analyzing the game in real time"
                />
                <figcaption>
                  Click the button → a new tab opens and Stockfish + the AI
                  coach get to work immediately on chessmasti.com.
                </figcaption>
              </figure>
              <figure>
                <img
                  src="/extension/1-insights-blunder-card.png"
                  alt="Move-by-move insight card identifying a blunder on move 9"
                />
                <figcaption>
                  Every key moment becomes a shareable insight card with its
                  own permalink.
                </figcaption>
              </figure>
            </div>
          </section>

          <section>
            <h2>How to install</h2>
            <ol className="cm-steps">
              <li>
                {STORE_URL ? (
                  <>
                    Click{" "}
                    <a href={STORE_URL} target="_blank" rel="noopener noreferrer">
                      Install on the Chrome Web Store
                    </a>{" "}
                    and add to Chrome (or Edge, Brave, Arc).
                  </>
                ) : (
                  <>Wait for the Web Store review to approve (in progress).</>
                )}
              </li>
              <li>Visit any game page on lichess.org or chess.com.</li>
              <li>
                Look for the orange <strong>♟ Analyze with Chess Masti</strong>{" "}
                button in the top navigation bar. (It may take a second to
                appear on the first page load.)
              </li>
              <li>Click it. The coach is waiting.</li>
            </ol>
          </section>

          <section>
            <h2>What the extension does not do</h2>
            <ul>
              <li>It does not collect personal information.</li>
              <li>It does not track your browsing across sites.</li>
              <li>
                It has no background script, no storage, and no remote server
                of its own.
              </li>
              <li>
                It runs only on lichess.org and chess.com — no other sites.
              </li>
              <li>
                It modifies those pages only by adding the single button.
              </li>
              <li>
                It sends the PGN only to chessmasti.com, and only when you
                click — equivalent to copy-pasting the PGN into chessmasti.com
                yourself.
              </li>
            </ul>
            <p>
              The full privacy disclosure for both this extension and the
              chessmasti.com website is at{" "}
              <Link href="/privacy">/privacy</Link>.
            </p>
          </section>

          <section>
            <h2>Browser support</h2>
            <p>
              Works in any Chromium browser: Chrome, Edge, Brave, Arc, Opera,
              Vivaldi. A Firefox port is planned.
            </p>
          </section>

          <nav className="cm-cross-links" aria-label="Related pages">
            <Link href="/how-it-works">How the coaching pipeline works →</Link>
            <Link href="/faq">FAQ →</Link>
            <Link href="/privacy">Privacy policy →</Link>
          </nav>
        </article>
      </main>
    </>
  );
}
