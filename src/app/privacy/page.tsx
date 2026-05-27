import type { Metadata } from "next";
import Link from "next/link";
import { contentPageStyles } from "../_seo/styles";

export const metadata: Metadata = {
  title: "Chess Masti AI — Privacy Policy",
  description:
    "What chessmasti.com and the 'Analyze with Chess Masti' Chrome extension collect, store, and send to third parties — plain English.",
  alternates: { canonical: "https://chessmasti.com/privacy" },
  openGraph: {
    title: "Chess Masti AI — Privacy Policy",
    description:
      "What chessmasti.com and the Chrome extension collect, store, and send.",
    url: "https://chessmasti.com/privacy",
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
    title: "Chess Masti AI — Privacy Policy",
    description: "Plain-English privacy disclosure.",
    images: ["https://chessmasti.com/social-networks-1200x630.png"],
  },
};

export default function PrivacyPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: contentPageStyles }} />
      <main className="cm-content">
        <nav className="cm-nav" aria-label="Site navigation">
          <Link href="/">Chess Masti AI</Link>
          <span className="cm-nav-sep">/</span>
          <span>Privacy</span>
        </nav>

        <article>
          <header>
            <h1>Privacy policy</h1>
            <p className="cm-lede">
              Plain English. Covers <strong>chessmasti.com</strong> (the website)
              and <strong>Analyze with Chess Masti</strong> (the Chrome extension).
              Last updated 2026-05-26.
            </p>
          </header>

          <section>
            <h2>The website — chessmasti.com</h2>

            <h3>What we store</h3>
            <ul>
              <li>
                <strong>Account</strong>: email, a bcrypt hash of your password (we
                never see the plaintext), and a Google account ID if you sign in
                with Google. Account data lives in Google Firestore.
              </li>
              <li>
                <strong>Saved games and preferences</strong>: PGNs you save,
                coaching-tone preference, playing style, study goals, favorite
                openings, and board/piece-set choices. Tied to your account in
                Firestore.
              </li>
              <li>
                <strong>Session cookie</strong> (<code>cm_session</code>): a signed
                JWT in an httpOnly cookie. Used only to keep you signed in.
              </li>
            </ul>

            <h3>What we send to third parties</h3>
            <ul>
              <li>
                <strong>Anthropic Claude</strong> receives the position (FEN), the
                relevant PGN snippet, and your coaching query so the coach can
                respond. We do not send your name, email, or account ID along with
                it.
              </li>
              <li>
                <strong>Lichess</strong> receives an OAuth token request if and
                only if you choose to connect your Lichess account to play live
                games.
              </li>
              <li>
                <strong>Resend</strong> sends the password-reset email when you
                request one.
              </li>
              <li>
                <strong>Google Firebase Analytics</strong> records anonymous page
                views and events so we can see which features are used. No
                content of your games or coaching chats is sent.
              </li>
            </ul>

            <h3>What we do not do</h3>
            <ul>
              <li>We do not sell your data. There is no advertising business model.</li>
              <li>We do not share PGNs or chats with anyone outside the third parties listed above.</li>
              <li>We do not run Stockfish on our servers — engine analysis happens in your browser as WebAssembly. Positions you analyse never have to leave your machine for the engine to evaluate them.</li>
            </ul>

            <h3>Deleting your data</h3>
            <p>
              Email <a href="mailto:aayan@chessmasti.com">aayan@chessmasti.com</a> and
              we'll delete your account and saved games within seven days.
            </p>
          </section>

          <section>
            <h2>The Chrome extension — Analyze with Chess Masti</h2>

            <h3>What the extension does</h3>
            <p>
              It adds an orange &quot;♟ Analyze with Chess Masti&quot; button to
              game pages on lichess.org and chess.com. When you click it, the
              extension reads the PGN of the game you are looking at and opens
              chessmasti.com/analysis in a new tab with that PGN in the URL.
              That&apos;s it.
            </p>

            <h3>What it accesses</h3>
            <ul>
              <li>
                <strong>The DOM of game pages</strong> on lichess.org and chess.com,
                only when one is open in your active tab. Used to detect that
                you&apos;re on a game page and to read the PGN.
              </li>
              <li>
                <strong>The public Lichess game-export endpoint</strong>{" "}
                (<code>https://lichess.org/game/export/&lt;id&gt;</code>) — fetched
                only when you click the button on a Lichess game, to get a clean
                PGN. No authentication, no cookies.
              </li>
            </ul>

            <h3>What it stores</h3>
            <p>
              Nothing. The extension has no <code>storage</code> permission, no
              background script, and no remote server of its own.
            </p>

            <h3>What it transmits</h3>
            <p>
              The PGN of the game you click on, sent only to{" "}
              <strong>chessmasti.com</strong> as a URL parameter when the new tab
              opens. Equivalent to copy-pasting the PGN into chessmasti.com
              yourself. Nothing is sent anywhere else.
            </p>

            <h3>What it does not do</h3>
            <ul>
              <li>It does not collect personal information, contact information, financial information, authentication data, or location.</li>
              <li>It does not track your browsing across sites.</li>
              <li>It does not run on any site other than lichess.org and chess.com.</li>
              <li>It does not modify the content of pages it runs on, beyond adding the single button.</li>
              <li>It does not use the data it accesses for any purpose other than opening chessmasti.com with your game pre-loaded.</li>
            </ul>
          </section>

          <section>
            <h2>Contact</h2>
            <p>
              Questions, deletion requests, or anything else:{" "}
              <a href="mailto:aayan@chessmasti.com">aayan@chessmasti.com</a>.
            </p>
          </section>

          <nav className="cm-cross-links" aria-label="Related pages">
            <Link href="/faq">FAQ →</Link>
            <Link href="/how-it-works">How the coaching pipeline works →</Link>
          </nav>
        </article>
      </main>
    </>
  );
}
