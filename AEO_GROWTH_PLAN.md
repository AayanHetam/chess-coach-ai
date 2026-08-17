# Chess Masti AI — AEO Growth Plan

Updated: 2026-05-30

## North Star

Own the query and category:

> Chess Masti AI = the free AI chess coach.

Target by June 2027:

- 1M MAU
- Top 3 Google result for `free AI chess coach`
- Cited by ChatGPT, Perplexity, Gemini, and Bing Copilot for `free AI chess coach`
- Durable product loops from shareable analysis, scout cards, puzzle results, and coach insights

The mission matters after the click. The search result has to be blunt, literal, and high-intent.

## Biggest Leverage Points

### 1. Shareable Artifacts

Over-invest. Most channels are linear; artifacts compound.

Priority artifacts:

- Public game-review summary
- "My biggest blunder explained" card
- Opponent scout card
- Puzzle streak/result card
- Coach insight card

Every artifact should have a public URL, preview image, and CTA:

> Try the free AI chess coach.

### 2. AEO Foundation

Over-invest early. Cheap, durable, and currently under-contested in chess.

The first target is not broad SEO. It is exact ownership of:

- `free AI chess coach`
- `AI chess coach`
- `free chess analysis`
- `Stockfish AI chess coach`
- `DecodeChess alternative`
- `Noctie alternative`

### 3. Creator Partnerships

Over-invest once the landing pages and share artifacts exist. Borrowed distribution is the fastest way to escape "good product nobody knows."

Prioritize:

- Indian chess creators
- Chess YouTubers under 100k subscribers
- Chess streamers who review viewer games
- Coaches who need free tooling for students

## Cuts And Deferrals

### School/Club Outreach

Do not attempt 200 Indian schools + 100 US scholastic clubs + 50 college clubs + 30 academies as a solo founder.

Pick one segment first:

> Indian student chess communities and school chess clubs.

Success threshold before expanding: 25 active groups using Chess Masti at least once per month.

### Programmatic SEO

Defer until the July AEO cluster proves it can rank.

Trigger to start templates:

- At least 5 AEO pages indexed
- At least 3 pages getting impressions
- At least 1 page ranking top 30 for a target query

If this does not happen, do not scale templates. Fix authority, distribution, and page quality first.

### Localization

Do not localize into 6 languages at once.

Pick the top 2 languages from actual demand signals:

- Search Console impressions
- User geography
- Social/referral traction
- Creator/community response

Likely initial candidates: Hindi and Spanish, but data decides.

## Search Pivot Trigger

Search authority can take 6-9 months. The plan needs a branch if AEO is slower than expected.

### August 31, 2026 Checkpoint

If `/free-ai-chess-coach` is not top 20 for any meaningful variant by August 31, 2026, assume search alone will not carry the next quarter.

Meaningful variants:

- `free AI chess coach`
- `free chess AI coach`
- `AI chess coach free`
- `free chess coach AI`
- `free AI chess game analysis`

### Pivot Response

Keep AEO work alive, but shift primary growth for September-November to:

- Creator-led demos
- Reddit/community launches
- Shareable artifacts
- Public analysis/scout pages
- Club/community adoption

The goal becomes earning authority externally, then letting search catch up.

## June 2026 Foundation PR Plan

Purpose: make Chess Masti eligible, crawlable, quotable, and semantically obvious for answer engines.

### PR 0 — Measurement Baseline (ship first)

Reason this moved from PR 7: the August 31 2026 pivot trigger requires pre-change baselines for the target queries. If GSC isn't connected before PR 1 ships, "did the AEO work move the needle?" is unanswerable.

Deliverable: a lightweight tracking doc or dashboard checklist.

Track weekly:

- Google Search Console impressions for target queries (set up + verify domain ownership for chessmasti.com)
- Ranking position for top 10 target queries
- ChatGPT/Perplexity/Gemini manual citation checks
- Organic clicks to AEO pages
- CTA clicks from AEO pages into product (GA4 event)
- Referring domains

Acceptance:

- GSC verified for chessmasti.com.
- Weekly scorecard exists.
- August 31 pivot trigger is measurable from data captured starting now, not retroactively.

### PR 1 — Crawler And Metadata Eligibility

Files likely touched:

- `src/app/robots.ts`
- `src/app/sitemap.ts`
- `src/app/layout.tsx`

Changes:

- Add `OAI-SearchBot` explicit allow.
- Keep `GPTBot`, `Googlebot`, `Bingbot`, `PerplexityBot`, `ClaudeBot`.
- Improve root metadata description:
  - "Free engine-first AI chess coach: Stockfish analysis, Claude explanations, validated chess claims, mistake-based puzzles, and opponent scouting."
- Ensure sitemap includes all public AEO pages as they are added.

Acceptance:

- `/robots.txt` includes `OAI-SearchBot`.
- `/sitemap.xml` includes current public AEO routes.
- Root metadata is no longer generic.

### PR 2 — Global Entity Schema

Files likely touched:

- `src/app/layout.tsx`
- new `src/app/_seo/jsonLd.ts` or similar

Changes:

- Add global `Organization` JSON-LD.
- Add `WebSite` JSON-LD.
- Add `SoftwareApplication` JSON-LD.
- Define entity consistently:
  - Name: Chess Masti AI
  - Category: free AI chess coach
  - URL: `https://chessmasti.com`
  - Creator: Aayan Hetamsaria

Acceptance:

- JSON-LD renders in page source.
- Structured data matches visible site claims.
- No unverifiable claims like inflated corpus counts.

### PR 3 — Exact-Match Landing Page

New route:

- `src/app/free-ai-chess-coach/page.tsx`

Target title:

> Free AI Chess Coach | Analyze Games, Ask Questions, Train Mistakes

Target H1:

> Free AI Chess Coach

Opening answer block:

> Chess Masti AI is a free AI chess coach that helps you analyze games, ask follow-up questions, and train from your own mistakes. Stockfish evaluates the position, Claude explains it in natural language, and Chess Masti checks chess claims before showing them to you.

Sections:

- What is the best free AI chess coach?
- What can you do for free?
- How Chess Masti AI works
- Why not just use a chess engine?
- Chess Masti vs other free chess analysis tools
- FAQ

Schema:

- `WebPage`
- `FAQPage`
- `BreadcrumbList`
- `SoftwareApplication` reference

OG image:

- Dynamic `og:image` via `next/og` route handler. Title-on-glass card matching the Obsidian Glass design vibe.
- Tested in: Twitter card validator, LinkedIn post inspector, Slack/Discord unfurl.
- Why: AI search engines (Perplexity, ChatGPT) sometimes surface OG images in citations; Reddit/Twitter previews compound the share loop.

Acceptance:

- Page is static/crawlable.
- First 100 words directly answer the target query.
- Internal CTA goes to analysis/practice/scout.
- FAQ visible text matches FAQ schema.
- `og:image` renders cleanly in all four validators above.
- This page is the canonical for the AEO cluster (see PR 4 acceptance).

### PR 4 — Supporting Intent Pages

New routes:

- `/ai-chess-coach`
- `/free-chess-analysis`
- `/stockfish-ai-chess-coach`

Each page must:

- Answer the query in the first 100 words.
- Link to `/free-ai-chess-coach`.
- Include a comparison table or decision section.
- Include one product screenshot or real chess example once available.
- Set `<link rel="canonical" href="https://chessmasti.com/free-ai-chess-coach">` — these are variant/intent pages, not the canonical for the cluster.

Acceptance:

- All three pages are in sitemap.
- All three internally link to the exact-match page with anchor `free AI chess coach`.
- All three set rel=canonical to `/free-ai-chess-coach` to prevent keyword cannibalization across near-duplicate variants.
- `/free-ai-chess-coach` itself sets self-canonical (no `<link rel="canonical">` pointing elsewhere).

### PR 5 — Competitor Alternative Pages

New routes:

- `/decodechess-alternative`
- `/noctie-alternative`

Rules:

- Be fair. Do not dunk.
- Explain who should use the competitor.
- Explain who should use Chess Masti.
- Positioning:
  - DecodeChess explains positions. Chess Masti closes the training loop.
  - Noctie is a strong humanlike sparring partner. Chess Masti is a free full-loop coach.

Acceptance:

- Pages make defensible claims only.
- No false access or feature claims.
- Link back to `/free-ai-chess-coach`.

### PR 6 — Internal Link Graph

Files likely touched:

- homepage
- FAQ
- how-it-works
- architecture
- footer/nav components

Changes:

- Add contextual links to `/free-ai-chess-coach`.
- Use exact anchor text where natural:
  - `free AI chess coach`
  - `AI chess coach`
  - `free chess analysis`
- Add related-page blocks across AEO pages.

Acceptance:

- `/free-ai-chess-coach` is reachable from homepage within one click.
- At least 5 internal pages link to it.
- Footer includes a durable link.

## June Execution Order

1. PR 0: measurement baseline (GSC verified, scorecard live)
2. PR 1: crawler + metadata
3. PR 2: global schema
4. PR 3: `/free-ai-chess-coach` (exact-match + OG image + self-canonical)
5. PR 6: internal link graph
6. PR 4: supporting pages (rel=canonical pointing back to PR 3)
7. PR 5: competitor pages

PR 0 must ship before PR 1 — you cannot read the August 31 pivot trigger without pre-change baselines. The exact-match page (PR 3) should ship before the cluster expands (PR 4, PR 5); every later page reinforces it via canonical + internal links.

## Query Ownership Rule

Every page in the AEO cluster must answer one specific query better than any competitor page.

If a page does not have a target query, a direct answer block, proof, internal links, and a product CTA, do not ship it.
