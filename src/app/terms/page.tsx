import type { Metadata } from "next";
import Link from "next/link";
import { contentPageStyles } from "../_seo/styles";

export const metadata: Metadata = {
  title: "Chess Masti AI — Terms of Service",
  description:
    "Plain-English terms for Chess Masti AI: the free tier, the 7-day Premium trial, $0.99/month auto-renewing Premium, and how to cancel.",
  alternates: { canonical: "https://chessmasti.com/terms" },
  openGraph: {
    title: "Chess Masti AI — Terms of Service",
    description:
      "Free tier, 7-day trial, $0.99/mo Premium (auto-renews), and cancellation.",
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
    description: "Free tier, 7-day trial, $0.99/mo Premium, easy cancellation.",
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
              <strong>chessmasti.com</strong>, including the free tier, the
              Premium subscription, and how billing and cancellation work. Last
              updated 2026-06-22.
            </p>
          </header>

          <section>
            <h2>Using Chess Masti</h2>
            <p>
              Chess Masti AI is a chess training tool — engine analysis, an AI
              coach, puzzles, and game review. Use it for your own learning and
              play. Don&apos;t abuse the service (no scraping, reselling, or
              attempts to break or overload it), and don&apos;t use it for
              anything unlawful. You&apos;re responsible for keeping your account
              secure.
            </p>
          </section>

          <section>
            <h2>Who can use it</h2>
            <p>
              Chess Masti is intended for users <strong>13 and older</strong>. If
              you are under 13, you may use it only with the involvement and
              consent of a parent or guardian, who agrees to these terms on your
              behalf and is responsible for any subscription. If you are a parent
              and believe a child under 13 has signed up without your consent,
              email us (below) and we&apos;ll remove the account and its data.
            </p>
          </section>

          <section>
            <h2>Free tier, trial, and Premium</h2>
            <ul>
              <li>
                <strong>Free tier</strong>: core features — playing, puzzles, the
                opening explorer, opponent scouting, saving games, and a
                daily allowance of AI-coach use — are free, with no credit card.
              </li>
              <li>
                <strong>7-day Premium trial</strong>: every new account gets full
                Premium free for 7 days. <strong>No card is required to start</strong>,
                and <strong>nothing auto-charges when the trial ends</strong> —
                if you do nothing, you simply return to the free tier.
              </li>
              <li>
                <strong>Premium</strong>: unlimited AI-coach analysis, follow-up
                chat, puzzle coaching, concept lessons, and grounded analysis for{" "}
                <strong>$0.99 USD per month</strong>.
              </li>
            </ul>
          </section>

          <section>
            <h2>Billing &amp; auto-renewal</h2>
            <ul>
              <li>
                When you choose to upgrade, payment is handled by{" "}
                <strong>Stripe</strong>. You enter your card on Stripe&apos;s
                secure checkout; we never see or store your full card number.
              </li>
              <li>
                Premium <strong>auto-renews monthly at $0.99 USD until you
                cancel</strong>. By subscribing you authorize this recurring
                charge.
              </li>
              <li>
                Stripe&apos;s checkout screen shows the exact amount due today
                before you confirm. If you upgrade while you still have trial
                time left, you are not charged until your trial ends; if you
                upgrade at or near the end of your trial, the first charge is due
                immediately — the checkout screen will say which.
              </li>
              <li>
                If we ever change the price, we&apos;ll tell you in advance and
                you can cancel before it takes effect.
              </li>
            </ul>
          </section>

          <section>
            <h2>Cancelling</h2>
            <p>
              You can cancel anytime — it&apos;s as easy as subscribing. Go to{" "}
              <Link href="/pricing">/pricing</Link> (or the{" "}
              <strong>Manage subscription</strong> item in your account menu),
              click <strong>Manage subscription</strong>, and cancel in the
              Stripe billing portal. Cancelling stops all future renewals. You
              keep Premium until the end of the period you&apos;ve already paid
              for, then return to the free tier.
            </p>
          </section>

          <section>
            <h2>Refunds</h2>
            <p>
              Because the 7-day trial lets you evaluate Premium in full before
              paying, all Premium charges are final and non-refundable, except
              where a refund is required by law. If you were charged in error or
              have a billing problem, email us (below) and we&apos;ll make it
              right.
            </p>
          </section>

          <section>
            <h2>Promo codes</h2>
            <p>
              Some codes (for example partner-programme codes for the Akanksha
              Foundation and Grandknights) grant free Premium access. Codes are
              for the intended recipients, may be limited or revoked, and have no
              cash value.
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
              after a change means you accept it. Questions about these terms or
              your subscription? Email{" "}
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
