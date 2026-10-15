import type { Metadata } from "next";
import Link from "next/link";
import { Masti, MastiSays } from "@/components/masti";
import { ACCENT, MOTION, RADIUS, TEXT } from "@/theme/tokens";
import { contentPageStyles } from "../_seo/styles";

export const metadata: Metadata = {
  title: "Chess Masti AI: Chrome extension",
  description:
    "One-click chess coaching for your Lichess and Chess.com games. The 'Analyze with Chess Masti' Chrome extension drops a button into the top nav and opens Masti with your PGN already loaded.",
  alternates: { canonical: "https://chessmasti.com/extension" },
  openGraph: {
    title: "Chess Masti AI: Chrome extension",
    description:
      "Add an Analyze button to Lichess and Chess.com. One click opens Masti.",
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
    title: "Chess Masti AI: Chrome extension",
    description:
      "One-click chess coaching for your Lichess and Chess.com games.",
    images: ["https://chessmasti.com/extension/2-lichess-button.png"],
  },
};

// The published Chrome Web Store listing (public since 2026-05-26).
// NEXT_PUBLIC_EXTENSION_STORE_URL only overrides it (build-time inline);
// unset, the page still links to the real listing.
const STORE_URL =
  process.env.NEXT_PUBLIC_EXTENSION_STORE_URL ??
  "https://chromewebstore.google.com/detail/analyze-with-chess-masti/fligcdcmibplmdbpggcjecpkclghdnpc";

/*
 * The light content theme's raised surface, hairline and secondary text
 * (LIGHT.raised, LIGHT.hairline and LIGHT.textSecondary in
 * src/theme/chessMasti.ts), written out because this is a CSS string rather
 * than an sx object.
 */
const LIGHT_RAISED = "#F5F5F7";
const LIGHT_HAIRLINE = "rgba(0, 0, 0, 0.1)";
const LIGHT_TEXT_SECONDARY = "#6E6E73";

const extraStyles = `
.cm-content {
  max-width: 920px;
}
.cm-hero-masti {
  margin: 0.4em 0 0.8em;
}
.cm-install-card {
  background: ${LIGHT_RAISED};
  border: 1px solid ${LIGHT_HAIRLINE};
  border-radius: ${RADIUS.card}px;
  padding: 40px 36px;
  margin: 2em 0 2.4em;
  display: flex;
  align-items: center;
  gap: 28px;
}
.cm-install-masti {
  flex: 0 0 auto;
}
.cm-install-body {
  flex: 1 1 auto;
  min-width: 0;
}
@media (max-width: 599px) {
  .cm-install-card {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
    padding: 28px 24px;
  }
}
.cm-install-card h2 {
  margin: 0 0 0.4em;
  font-size: 1.7rem;
}
.cm-install-card p {
  font-size: 1.05rem;
  margin: 0 0 1.4em;
}
.cm-content .cm-install-cta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: ${ACCENT.main};
  color: ${TEXT.onAccent};
  font-weight: 600;
  font-size: 1rem;
  padding: 14px 28px;
  border-radius: ${RADIUS.pill}px;
  text-decoration: none;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: background-color ${MOTION.hover}, transform ${MOTION.press};
}
.cm-content .cm-install-cta:hover {
  background: ${ACCENT.hover};
  color: ${TEXT.onAccent};
}
.cm-content .cm-install-cta:active {
  transform: ${MOTION.pressScale};
}
.cm-content .cm-install-cta:focus-visible {
  outline: 2px solid currentColor;
  outline-offset: 2px;
}
.cm-install-note {
  margin-top: 12px;
  font-size: 0.88rem;
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
  border-radius: ${RADIUS.control}px;
  border: 1px solid ${LIGHT_HAIRLINE};
}
.cm-shotgrid figcaption {
  font-size: 0.92rem;
  color: ${LIGHT_TEXT_SECONDARY};
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
  border-bottom: 1px solid ${LIGHT_HAIRLINE};
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
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  display: flex;
  align-items: center;
  justify-content: center;
}
`;

function InstallCTA() {
  return (
    <div className="cm-install-card">
      {/* A still on purpose: the hero above already plays his burst, and one
          animated Masti per view is the rule. The card copy says it all, so
          he is decorative here. */}
      <div className="cm-install-masti">
        <Masti mood="idea" size={104} animated={false} decorative />
      </div>
      <div className="cm-install-body">
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
          Install from the Chrome Web Store
        </a>
      </div>
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
          <span>Chrome extension</span>
        </nav>

        <article>
          <header>
            <h1>Analyze with Chess Masti, the Chrome extension</h1>
            <p className="cm-lede">
              One orange button, dropped into the top navigation of every
              Lichess and Chess.com game page. Click it. Your PGN comes with you
              to chessmasti.com and Masti is already talking. No copy-paste, no
              upload, no account.
            </p>
            {/* The coach greets in the hero. Figure and bubble are a flex
                row, so the bubble shrinks and wraps at phone width instead
                of pushing the page sideways. */}
            <MastiSays
              mood="wave"
              size={120}
              tone="glass"
              priority
              loops={3}
              replayOnHover
              maxWidth={420}
              className="cm-hero-masti"
            >
              Finish a game, hit the orange button, and I&apos;m already reading
              your moves by the time the tab opens.
            </MastiSays>
          </header>

          <InstallCTA />

          <section>
            <h2>What you get</h2>
            <p>
              The whole point of the extension is to kill the friction between
              finishing a game and reviewing it. Right now, you finish a game on
              Lichess or Chess.com and the &quot;Rematch&quot; button is right
              there. So you click it. The blunder dies undiagnosed.
            </p>
            <p>
              With the extension installed, a single orange{" "}
              <strong>Analyze with Chess Masti</strong> button sits in the top
              nav of every game page. Click it and a new tab opens at
              chessmasti.com with your PGN already loaded. Stockfish evaluates
              in your browser, Masti starts a real conversation about your
              moves, and every claim is checked before it reaches you. It&apos;s
              the post-mortem you keep meaning to do, in one click.
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
                  Click the button: a new tab opens and Stockfish and Masti get
                  to work on chessmasti.com.
                </figcaption>
              </figure>
              <figure>
                <img
                  src="/extension/1-insights-blunder-card.png"
                  alt="Move-by-move card showing a blunder on move 9"
                />
                <figcaption>
                  Every key moment becomes a shareable card with its own link.
                </figcaption>
              </figure>
            </div>
          </section>

          <section>
            <h2>How to install</h2>
            <ol className="cm-steps">
              <li>
                Click{" "}
                <a href={STORE_URL} target="_blank" rel="noopener noreferrer">
                  Install on the Chrome Web Store
                </a>{" "}
                and add to Chrome (or Edge, Brave, Arc).
              </li>
              <li>Visit any game page on lichess.org or chess.com.</li>
              <li>
                Look for the orange <strong>Analyze with Chess Masti</strong>{" "}
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
                It has no background script, no storage, and no remote server of
                its own.
              </li>
              <li>
                It runs only on lichess.org and chess.com, and on no other
                sites.
              </li>
              <li>It modifies those pages only by adding the single button.</li>
              <li>
                It sends the PGN only to chessmasti.com, and only when you
                click, which is the same as pasting the PGN into chessmasti.com
                yourself.
              </li>
            </ul>
            <p>
              The full privacy disclosure for both this extension and the
              chessmasti.com website is at <Link href="/privacy">/privacy</Link>
              .
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
            <Link href="/how-it-works">How the coaching works</Link>
            <Link href="/faq">FAQ</Link>
            <Link href="/privacy">Privacy policy</Link>
          </nav>
        </article>
      </main>
    </>
  );
}
