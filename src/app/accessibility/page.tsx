import type { Metadata } from "next";
import Link from "next/link";
import { contentPageStyles } from "../_seo/styles";

export const metadata: Metadata = {
  title: "Chess Masti AI — Accessibility Statement",
  description:
    "How Chess Masti AI works for screen-reader, keyboard, and reduced-motion users, what we're still fixing, and how to report a barrier.",
  alternates: { canonical: "https://chessmasti.com/accessibility" },
  openGraph: {
    title: "Chess Masti AI — Accessibility Statement",
    description:
      "Our commitment to WCAG 2.1 AA, known limitations, and how to report a barrier.",
    url: "https://chessmasti.com/accessibility",
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
    title: "Chess Masti AI — Accessibility Statement",
    description:
      "Our commitment to WCAG 2.1 AA, known limitations, and how to report a barrier.",
    images: ["https://chessmasti.com/social-networks-1200x630.png"],
  },
};

export default function AccessibilityPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: contentPageStyles }} />
      <main className="cm-content">
        <nav className="cm-nav" aria-label="Site navigation">
          <Link href="/">Chess Masti AI</Link>
          <span className="cm-nav-sep">/</span>
          <span>Accessibility</span>
        </nav>

        <article>
          <header>
            <h1>Accessibility Statement</h1>
            <p className="cm-lede">
              Chess Masti AI should be usable by everyone who wants to get
              better at chess — including people who rely on screen readers,
              keyboard navigation, magnification, or reduced motion. This page
              says where we are honestly: what works, what doesn&apos;t yet,
              and how to tell us when something is in your way. Last updated
              2026-08-26.
            </p>
          </header>

          <section>
            <h2>Our commitment</h2>
            <p>
              We are working toward conformance with the{" "}
              <a
                href="https://www.w3.org/TR/WCAG21/"
                target="_blank"
                rel="noopener noreferrer"
              >
                Web Content Accessibility Guidelines (WCAG) 2.1
              </a>{" "}
              at level AA. We have not yet completed a formal third-party
              audit, so we describe the site as <strong>partially
              conformant</strong>: much of it meets the guidelines, and the
              known gaps are listed below. Accessibility fixes are treated as
              bugs, not feature requests.
            </p>
          </section>

          <section>
            <h2>What we do today</h2>
            <ul>
              <li>
                <strong>Semantic structure</strong>: pages use real headings,
                landmarks, buttons, and links so assistive technology can
                navigate them.
              </li>
              <li>
                <strong>Keyboard support</strong>: site navigation, dialogs,
                forms, and settings are operable by keyboard, with a single
                consistent focus-indicator colour across the site.
              </li>
              <li>
                <strong>Dark, high-contrast theme</strong>: the interface is
                designed dark-first, and we check body text and interactive
                elements against WCAG contrast ratios.
              </li>
              <li>
                <strong>Text alternatives</strong>: interactive icons carry
                accessible labels, and analysis output is delivered as text —
                the coach&apos;s explanations, move lists, and evaluations are
                readable, not image-only.
              </li>
              <li>
                <strong>No time pressure by default</strong>: lessons, puzzles,
                and game review are self-paced. Timed play is always an
                explicit choice.
              </li>
            </ul>
          </section>

          <section>
            <h2>Known limitations</h2>
            <p>
              We would rather tell you now than have you discover it
              mid-session:
            </p>
            <ul>
              <li>
                <strong>Board move entry is pointer-first.</strong> The
                chessboard is built around click or drag-and-drop moves. Some
                training surfaces do not yet accept keyboard-only move entry
                (for example typing a move in algebraic notation). This is our
                biggest known gap and it is on the roadmap.
              </li>
              <li>
                <strong>The board itself is visual.</strong> The position on
                the board is not yet fully described to screen readers
                square-by-square. Move lists and the coach&apos;s text analysis
                are the reliable non-visual way to follow a game today.
              </li>
              <li>
                <strong>Evaluation graphs and charts</strong> (such as the
                advantage graph in game review) are visual summaries; the same
                information exists in the move-by-move text but is not yet
                announced alongside the chart.
              </li>
              <li>
                <strong>Animation</strong>: the site uses short motion effects
                and does not yet honour the{" "}
                <code>prefers-reduced-motion</code> setting everywhere.
              </li>
            </ul>
          </section>

          <section>
            <h2>Compatibility</h2>
            <p>
              Chess Masti is tested on current versions of Chrome, Firefox,
              Safari, and Edge, on desktop and mobile. It is designed to work
              with common screen readers (VoiceOver, NVDA, TalkBack) within the
              limits described above. The site does not require a specific
              input device: mouse, touch, and keyboard are all supported for
              everything except the board-entry gaps listed above.
            </p>
          </section>

          <section>
            <h2>Report a barrier</h2>
            <p>
              If anything on the site is hard or impossible for you to use,
              please tell us — that report is the fastest way for it to get
              fixed. Email{" "}
              <a href="mailto:aayanhetamsaria4@gmail.com">
                aayanhetamsaria4@gmail.com
              </a>{" "}
              with the page you were on, what you were trying to do, and the
              assistive technology or browser you were using. We read every
              report and aim to respond within a few days.
            </p>
            <p>
              See also our <Link href="/terms">Terms of Service</Link> and{" "}
              <Link href="/privacy">Privacy Policy</Link>.
            </p>
          </section>
        </article>
      </main>
    </>
  );
}
