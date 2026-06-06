# Chess Masti AEO — Weekly Scorecard

Companion to [AEO_GROWTH_PLAN.md](AEO_GROWTH_PLAN.md). Fill in every Sunday. **Aug 31 2026 is the pivot trigger.**

> **Code surface status (2026-06-06):** All 21 AEO pages live in production with JSON-LD validated in SSR HTML. Sitemap, robots, OG cards green. The bottleneck is now measurement setup, not code.

---

## One-Time Setup Runbook (15 min)

Do these in order. Steps 1–3 are GSC; steps 4–5 are the AI baseline. Without these, the Aug 31 pivot trigger is unreadable.

### Step 1: Verify chessmasti.com in Google Search Console (3 min)

1. Open **[search.google.com/search-console](https://search.google.com/search-console)** in a browser signed into the Google account that owns the Firebase project (the one that has the GA4 `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`).
2. Click **Add property** → **URL prefix** → paste `https://chessmasti.com` → Continue.
3. GSC offers verification methods. **Pick "Google Analytics" first** — it should one-click verify because GA4 is already wired in [layout.tsx](src/app/layout.tsx). If it doesn't show up, fall back to:
   - **HTML file:** download the file (named like `google1234abc.html`), paste the filename into a fresh chat with Claude, who'll add it to `/public/` in a 30-second PR. After deploy click Verify.
   - **DNS TXT record:** add the TXT record to Vercel DNS (Settings → Domains → DNS). Propagation can take 10–60 min before Verify works.

✅ Done when GSC shows your property as verified.

### Step 2: Submit the sitemap (1 min)

1. In GSC: **Sitemaps** → enter `sitemap.xml` → Submit.
2. The sitemap already includes all 21 AEO pages plus core surfaces. After submission Google starts indexing them within days.

### Step 3: Request priority indexing (3 min)

GSC will eventually crawl every URL but you can jump the queue for the canonical pages. Use **URL Inspection** at the top of GSC and paste each of these one at a time, clicking **Request Indexing**:

- `https://chessmasti.com/free-ai-chess-coach` ← top priority
- `https://chessmasti.com/best-free-ai-chess-coach`
- `https://chessmasti.com/how-to-analyze-lichess-game-with-ai`
- `https://chessmasti.com/how-to-analyze-chess-com-game-with-ai`
- `https://chessmasti.com/faq`

The two how-to pages have HowTo schema and the FAQ has FAQPage schema — both are eligible for rich-result treatment and should be prioritized.

### Step 4: AI citation baseline (5 min)

Open each engine in a fresh tab (signed out / incognito if possible to avoid personalization bias). Run the exact prompt. Copy the first paragraph of the response into the table below. If Chess Masti **is** mentioned, paste the sentence; otherwise leave the snippet column "—".

This snapshot is the "before." Re-run on the first Sunday of every month. When Chess Masti starts appearing, that's the AEO investment paying off.

| Engine | Prompt | Date | Chess Masti mentioned? | Citation snippet |
|---|---|---|---|---|
| ChatGPT | "What is the best free AI chess coach?" | 2026-06-06 | _fill in_ | _fill in_ |
| ChatGPT | "Free AI chess coach online" | 2026-06-06 | _fill in_ | _fill in_ |
| Perplexity | "What is the best free AI chess coach?" | 2026-06-06 | _fill in_ | _fill in_ |
| Perplexity | "Free alternative to DecodeChess" | 2026-06-06 | _fill in_ | _fill in_ |
| Gemini | "Best free AI chess coach" | 2026-06-06 | _fill in_ | _fill in_ |
| Bing Copilot | "Free AI chess coach" | 2026-06-06 | _fill in_ | _fill in_ |

### Step 5: GA4 sanity check (2 min)

1. Open analytics.google.com → Chess Masti property → **Realtime**.
2. Open chessmasti.com in another tab. You should appear as an active user within ~30 seconds.
3. If not: GA4 isn't reporting and Step 1's GA-based GSC verification won't work either — verify via HTML file instead.

---

## Target Queries

Primary (exact-match page `/free-ai-chess-coach`):

1. `free AI chess coach`
2. `AI chess coach free`
3. `free chess AI coach`
4. `free AI chess game analysis`

Secondary (supporting pages):

5. `AI chess coach`
6. `free chess analysis`
7. `Stockfish AI chess coach`

Competitor alternative:

8. `DecodeChess alternative`
9. `Noctie alternative`

---

## Aug 31 2026 Pivot Trigger

If **none** of queries 1–5 above appear in GSC with a top-20 average position by Aug 31 2026, search alone will not carry Q4. Shift primary growth Sept–Nov to creator-led demos, shareable artifacts, and community channels. Keep AEO content alive but stop waiting for it to move the MAU needle.

**Check:** In GSC Performance → filter Pages → `/free-ai-chess-coach` → Queries tab → sort by Position ascending → is any of queries 1–5 in the list at position ≤ 20?

---

## Weekly Scorecard

Fill in every Sunday. Week is YYYY-WW (ISO week number).

### GSC: `/free-ai-chess-coach`

| Week | Impressions | Clicks | CTR | Avg Position (Q1–Q5) |
|---|---|---|---|---|
| baseline (pre-PR1) | 0 | 0 | — | not ranking |
| | | | | |

### GSC: `/ai-chess-coach` (once PR 4 ships)

| Week | Impressions | Clicks | CTR | Avg Position |
|---|---|---|---|---|
| | | | | |

### GSC: `/decodechess-alternative` (once PR 5 ships)

| Week | Impressions | Clicks | CTR | Avg Position |
|---|---|---|---|---|
| | | | | |

### Site-wide (all AEO pages combined)

| Week | Organic clicks | Referring domains | Shared artifacts/mo | MAU |
|---|---|---|---|---|
| baseline | 0 | check Ahrefs/Semrush | 0 | ~100 |
| | | | | |

### Monthly milestones (from plan)

| Month | Target MAU | Target organic clicks/mo | Target indexed pages | On track? |
|---|---|---|---|---|
| Jun 2026 | 500 | 50 | 20 | |
| Jul 2026 | 2,000 | 300 | 20+ cluster | |
| Aug 2026 | 10,000 | 2,000 | — | |
| Sep 2026 | 30,000 | 7,000 | — | |
| Oct 2026 | 75,000 | 15,000 | — | |
| Nov 2026 | 150,000 | 40,000 | 150 | |
| Dec 2026 | 250,000 | — | — | |
| Jan 2027 | 350,000 | — | — | |
| Feb 2027 | 500,000 | — | — | |
| Mar 2027 | 650,000 | — | — | |
| Apr 2027 | 800,000 | — | — | |
| May 2027 | 950,000 | — | — | |
| Jun 2027 | 1,000,000 | 300,000 | 500 RD | |

---

## Weekly Ritual (10 min)

1. Open GSC Performance → set date range to Last 7 days → export top 20 queries by impressions.
2. Check if `/free-ai-chess-coach` has any impressions yet. If yes, note position.
3. Run 2 AI citation checks from the table above (rotate monthly to cover all 6).
4. Note one thing to ship or update this week.
5. Fill in the row above.

---

## Referring Domains

Check via Ahrefs free tier (or Semrush) once a month. Target is 25 referring domains by Sep 2026.

| Month | Referring domains | Notable new links |
|---|---|---|
| Jun 2026 baseline | | |
| | | |
