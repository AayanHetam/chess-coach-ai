import type { Metadata } from "next";
import Link from "next/link";
import { contentPageStyles } from "../_seo/styles";

export const metadata: Metadata = {
  title: "Chess Masti AI — Terms of Service",
  description:
    "Plain-English terms for using Chess Masti AI's free chess coaching tools.",
  alternates: { canonical: "https://chessmasti.com/terms" },
  openGraph: {
    title: "Chess Masti AI — Terms of Service",
    description:
      "Plain-English terms for using Chess Masti AI's free chess coaching tools.",
    url: "https://chessmasti.com/terms",
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
    title: "Chess Masti AI — Terms of Service",
    description: "Plain-English terms for using Chess Masti AI.",
    images: ["https://chessmasti.com/social-networks-1200x630.png"],
  },
};

export default function TermsPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: contentPageStyles }} />
      <main className="cm-content">
        <nav className="cm-nav" aria-label="Site navigation">
          <Link href="/">Chess Masti AI</Link>
          <span className="cm-nav-sep">/</span>
          <span>Terms</span>
        </nav>

        <article>
          <header>
            <h1>Terms of Service</h1>
            <p className="cm-lede">
              Plain English. These terms cover your use of{" "}
              <strong>chessmasti.com</strong> and its free chess coaching tools.
              Last updated August 21, 2026.
            </p>
          </header>

          <section>
            <h2>Using Chess Masti</h2>
            <p>
              Chess Masti AI is a chess training tool — engine analysis, an AI
              coach, puzzles, and game review. Use it for your own learning and
              play. Don&apos;t abuse the service (no scraping, reselling, or
              attempts to break or overload it), and don&apos;t use it for
              anything unlawful. You&apos;re responsible for keeping your
              account secure.
            </p>
          </section>

          <section>
            <h2>Who can use it</h2>
            <p>
              You must be at least <strong>13 years old</strong> to use Chess
              Masti. Children under 13 may not create an account or use the
              service. Permission from a parent or guardian does not create an
              exception. Chess Masti does not currently operate a verified
              parental-consent system for users under 13.
            </p>
          </section>

          <section>
            <h2>Free service</h2>
            <p>
              Chess Masti is free to use, including its chess coaching features.
              We may change, add, limit, suspend, or retire features as the
              service evolves, and we do not guarantee that any particular
              feature will always be available.
            </p>
          </section>

          <section>
            <h2>No guarantees</h2>
            <p>
              Coaching and analysis are for learning and entertainment. AI
              output can be wrong — verify important lines yourself. The service
              is provided &quot;as is&quot;, without warranties, to the extent
              the law allows.
            </p>
          </section>

          <section>
            <h2>Changes &amp; contact</h2>
            <p>
              We may update these terms; we&apos;ll change the date above and,
              for material changes, give notice. Continuing to use Chess Masti
              after a change means you accept it. Questions about these terms?
              Email{" "}
              <a href="mailto:aayanhetamsaria4@gmail.com">
                aayanhetamsaria4@gmail.com
              </a>
              . See also our <Link href="/privacy">Privacy Policy</Link>.
            </p>
          </section>
        </article>
      </main>
    </>
  );
}
