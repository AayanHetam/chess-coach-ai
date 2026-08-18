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
              Plain English. Covers <strong>chessmasti.com</strong> (the
              website) and <strong>Analyze with Chess Masti</strong> (the Chrome
              extension). Last updated 2026-08-17.
            </p>
          </header>

          <section>
            <h2>The website — chessmasti.com</h2>

            <h3>What we store</h3>
            <ul>
              <li>
                <strong>Account</strong>: email, a bcrypt hash of your password
                (we never see the plaintext), and a Google account ID if you
                sign in with Google. Account data lives in Google Firestore.
              </li>
              <li>
                <strong>Saved games and preferences</strong>: PGNs you save,
                coaching-tone preference, playing style, study goals, favorite
                openings, and board/piece-set choices. Tied to your account in
                Firestore.
              </li>
              <li>
                <strong>Session cookie</strong> (<code>cm_session</code>): a
                signed JWT in an httpOnly cookie. Used only to keep you signed
                in.
              </li>
            </ul>

            <h3>What we send to third parties</h3>
            <ul>
              <li>
                <strong>Anthropic Claude and OpenAI</strong>: Anthropic normally
                processes AI coaching requests. OpenAI may process the same
                request if Anthropic fails or if OpenAI is the configured
                provider. The request can include the position (FEN), relevant
                PGN, coaching query and chat messages, ratings, and Chess.com or
                Lichess usernames used to personalize the coaching.
              </li>
              <li>
                <strong>The Maia-2 microservice</strong> receives the current
                position (FEN) and the two ratings (yours and the bot&apos;s)
                when you play against the Twin Bot opponent, so it can return a
                humanlike move. It receives nothing else.
              </li>
              <li>
                <strong>Public Lichess and Chess.com APIs</strong> are queried
                from our server when you scout an opponent, import a game, or
                ask the coach about a named opponent — we fetch their publicly
                listed game history (the same data anyone can see on those
                sites). We never use private or authenticated endpoints unless
                you opt in via OAuth.
              </li>
              <li>
                <strong>Lichess OAuth</strong> is used only if you choose to
                connect your Lichess account to play live games through us.
              </li>
              <li>
                <strong>Resend</strong> sends the password-reset email when you
                request one.
              </li>
              <li>
                <strong>Google Firebase Analytics</strong> and{" "}
                <strong>Vercel Analytics</strong> collect page-view and usage
                information through browser analytics components. Chess Masti
                does not add game PGNs or coaching-chat content to those
                analytics events.
              </li>
              <li>
                <strong>Sentry</strong> may receive sanitized operational errors
                from the website in your browser and from Chess Masti&apos;s
                servers, together with technical context such as a stack trace,
                request route, browser type, and hardware metadata. Chess Masti
                does not intentionally send AI prompts, coaching-chat messages,
                AI responses, FENs, PGNs, account identifiers, or raw provider
                error bodies to Sentry. It is used only for diagnosing failures.
              </li>
            </ul>

            <h3>Where data lives</h3>
            <ul>
              <li>
                <strong>On our servers (Google Firestore)</strong> via the
                Firebase Admin SDK: account, saved games, preferences. Server-
                side only — your browser never connects to Firestore directly.
              </li>
              <li>
                <strong>On your device (IndexedDB)</strong>: puzzle progress and
                spaced-repetition state. Stored locally in your browser and
                never sent to us.
              </li>
              <li>
                <strong>On Supabase</strong>: the internal feedback portal
                stores feedback submitted by people on the intern allowlist.
                When an authorized intern flags a coaching response, that
                submission includes the flagged response, chat history, the
                intern&apos;s account identifiers, their explanation and
                suggested response, and any available FEN or PGN. Separately,
                consent-controlled analytics endpoints can store interaction
                event names and properties, account or anonymous identifiers,
                session and request IDs, a salted IP hash when configured,
                browser and referrer information, and app version. Dedicated
                puzzle and analysis-session analytics can also store puzzle
                details, moves and outcomes, FEN or PGN, timestamps, and counts
                of queried moves or chat turns.
              </li>
            </ul>

            <h3>AI-call content and operational statistics</h3>
            <p>
              Automatic full AI-conversation capture is disabled in the
              application, including when <code>TRACKING_ENABLED</code> is true.
              Chess Masti does not write AI system prompts, coaching-chat
              messages, AI response text, provider error text, account or
              anonymous identifiers, FENs, or PGNs to Supabase through AI-call
              tracking.
            </p>
            <p>
              For operational monitoring, each running server process keeps
              temporary aggregate AI statistics in memory: call counts, provider
              and model names, token totals, prompt-cache totals, elapsed-time
              totals, timestamps, and fallback counts and status codes. These
              statistics reset when the server process restarts and are not
              written to Supabase. They do not contain prompts, messages,
              responses, user identifiers, FENs, or PGNs.
            </p>

            <h3>Tracking controls</h3>
            <p>
              Chess Masti&apos;s custom browser-event tracking endpoints check
              the analytics choice stored in the <code>cm_consent</code> cookie
              and honor the browser&apos;s Global Privacy Control signal. The
              consent-controlled event, puzzle-attempt, and analysis-session
              analytics described above are also disabled unless the
              server&apos;s
              <code>TRACKING_ENABLED</code> configuration is on. Google Firebase
              Analytics and Vercel Analytics are loaded separately from these
              custom tracking endpoints.
            </p>

            <h3>What we do not do</h3>
            <ul>
              <li>
                We do not sell your data. There is no advertising business
                model.
              </li>
              <li>
                We use and disclose PGNs and chats only as described in this
                policy.
              </li>
              <li>
                We do not run Stockfish on our servers — engine analysis happens
                in your browser as WebAssembly. Positions you analyse stay on
                your machine for engine evaluation; they only leave it when you
                choose to ask the AI coach about them.
              </li>
            </ul>

            <h3>Children</h3>
            <p>
              Chess Masti is intended for users aged 13 and over, and we ask you
              to confirm you&apos;re 13+ when you create an account. We
              don&apos;t knowingly collect personal information from children
              under 13. If you believe a child under 13 has signed up without a
              parent&apos;s involvement, email us at{" "}
              <a href="mailto:aayanhetamsaria4@gmail.com">
                aayanhetamsaria4@gmail.com
              </a>{" "}
              and we&apos;ll delete the account and its data.
            </p>

            <h3>Deleting your data</h3>
            <p>
              Email{" "}
              <a href="mailto:aayanhetamsaria4@gmail.com">
                aayanhetamsaria4@gmail.com
              </a>{" "}
              and we'll delete your account and saved games within seven days.
            </p>
          </section>

          <section>
            <h2>The Chrome extension — Analyze with Chess Masti</h2>

            <h3>What the extension does</h3>
            <p>
              It adds an orange &quot;♟ Analyze with Chess Masti&quot; button
              to game pages on lichess.org and chess.com. When you click it, the
              extension reads the PGN of the game you are looking at and opens
              chessmasti.com/analysis in a new tab with that PGN in the URL.
              That&apos;s it.
            </p>

            <h3>What it accesses</h3>
            <ul>
              <li>
                <strong>The DOM of pages on lichess.org and chess.com.</strong>{" "}
                Per Chrome&apos;s extension model the content script has read
                access to every page on those two domains while the extension is
                installed. In practice it does nothing on pages that aren&apos;t
                a game-like URL — the button only appears, and the PGN is only
                read, on paths such as <code>/game/</code>,{" "}
                <code>/analysis/</code>,<code>/play/</code>, <code>/live/</code>
                , and <code>/daily/</code>, and on the Lichess game-ID URLs.
              </li>
              <li>
                <strong>The public Lichess game-export endpoint</strong> (
                <code>https://lichess.org/game/export/&lt;id&gt;</code>) —
                fetched only when you click the button on a Lichess game, to get
                a clean PGN. No authentication, no cookies.
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
              <strong>chessmasti.com</strong> as a URL parameter when the new
              tab opens. Equivalent to copy-pasting the PGN into chessmasti.com
              yourself. Nothing is sent anywhere else.
            </p>

            <h3>What it does not do</h3>
            <ul>
              <li>
                It does not collect personal information, contact information,
                financial information, authentication data, or location.
              </li>
              <li>It does not track your browsing across sites.</li>
              <li>
                It does not run on any site other than lichess.org and
                chess.com.
              </li>
              <li>
                It does not modify the content of pages it runs on, beyond
                adding the single button.
              </li>
              <li>
                It does not use the data it accesses for any purpose other than
                opening chessmasti.com with your game pre-loaded.
              </li>
            </ul>
          </section>

          <section>
            <h2>Contact</h2>
            <p>
              Questions, deletion requests, or anything else:{" "}
              <a href="mailto:aayanhetamsaria4@gmail.com">
                aayanhetamsaria4@gmail.com
              </a>
              .
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
