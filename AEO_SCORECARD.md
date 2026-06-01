# Chess Masti AEO — Weekly Scorecard

Companion to [AEO_GROWTH_PLAN.md](AEO_GROWTH_PLAN.md). Fill in every Sunday. Aug 31 2026 is the pivot trigger.

---

## One-Time Setup Checklist

Complete before PR 1 ships. These create the baselines. Without them you cannot answer "did the AEO work move the needle?"

### Google Search Console

- [ ] Sign in at search.google.com/search-console
- [ ] Add property: `https://chessmasti.com` (URL-prefix property)
- [ ] Verify via one method:
  - HTML file: download, upload to `/public/`, deploy, click Verify
  - DNS TXT record: add `google-site-verification=...` to Vercel DNS (Settings → Domains → DNS)
  - Google Analytics: GA4 is already wired (`NEXT_PUBLIC_GA_MEASUREMENT_ID`), pick this if GSC auto-detects it
- [ ] Request indexing for `/` via the URL Inspection tool
- [ ] Confirm sitemap submitted: Settings → Sitemaps → `https://chessmasti.com/sitemap.xml` → Submit
- [ ] Pin the Performance report. Default date range: Last 28 days. Default filter: Web.

### GA4 (already wired via Firebase)

- [ ] Confirm GA4 is receiving sessions: Realtime → open chessmasti.com → see active users
- [ ] Create a custom audience or event filter for AEO pages (add as pages ship):
  - `/free-ai-chess-coach`
  - `/ai-chess-coach`
  - `/free-chess-analysis`
  - `/stockfish-ai-chess-coach`
  - `/decodechess-alternative`
  - `/noctie-alternative`

### Manual AI Citation Baseline

Run these prompts once now to capture the pre-PR baseline. Copy the exact first paragraph of each answer into the table below.

| Engine | Prompt | Date | Chess Masti mentioned? | Citation snippet |
|---|---|---|---|---|
| ChatGPT | "What is the best free AI chess coach?" | | No | — |
| ChatGPT | "Free AI chess coach online" | | No | — |
| Perplexity | "What is the best free AI chess coach?" | | No | — |
| Perplexity | "Free alternative to DecodeChess" | | No | — |
| Gemini | "Best free AI chess coach" | | No | — |
| Bing Copilot | "Free AI chess coach" | | No | — |

Re-run this table once a month (first Sunday).

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
