# Where these contacts came from

Collected 2026-09-07. Every row in `gm-contacts.csv` carries its own `source_url`.

## 1. Lichess public coach directory — 118 GM emails (the bulk)

`https://lichess.org/coach` lists titled players who have opted in to being
contacted for paid coaching. Many publish an email in their own profile text
("contact me at ...", "Email: ...").

- Crawled the paginated public directory (allowed by `lichess.org/robots.txt`,
  which disallows only `/api/`, `/game/export/`, `/games/export/`,
  `/opening/config/` and `/study/search`). Rate-limited to ~1 request/sec.
- Directory yielded **1,964 titled coaches**: 324 GM, 479 IM, 562 FM, 217 CM,
  162 NM, 100 WFM, 83 WIM, 36 WGM, 1 LM.
- Fetched all 324 GM profiles; **118 (36%) publish an email address**.
- Emails were read from rendered profile text only. Spot-checked against source
  context to confirm each address belongs to the coach, not a third party.

These are the best rows in the file: the person has *opted in* to being emailed
about chess work.

## 2. University chess programmes — public staff directories

UT Dallas, UTRGV, Texas Tech, Saint Louis University. Institutional `.edu`
addresses printed on programme staff pages.

## 3. State / regional federation coach directories

Illinois Chess Association (`il-chess.org`) publishes GM coach emails in plain
text. Checked and rejected: the English Chess Federation registered-coaches list
(names and regions only, no emails) and NSCF New York (bot-verification wall).

## 4. Academy, foundation and club inboxes

Chess Gurukul, Chess Pathshala, Pro Chess Training, ASEAN Chess Academy,
Grandmaster Chess Institute, GMChessPrep, Azeri Chess Academy, Grand Knights,
Chess Max, Saint Louis Chess Club, Kasparov Chess Foundation, Mechanics'
Institute. These are `GM_GROUP` / `GM_ORG` rows — one inbox that fronts several
GMs. Good for a sponsorship or ambassador approach, since that decision usually
sits with the business side anyway.

## 5. Individual public contact pages / press addresses

Personal sites and published press addresses (e.g. `pr@mauriceashley.com`,
`teamgmhikaru@gmail.com`).

---

## What was deliberately NOT done

- **No decoding of Cloudflare-obfuscated addresses.** The Pittsburgh Chess Club
  directory publishes GM Alexander Shabalov's and GM Bryan Smith's emails behind
  Cloudflare's anti-harvesting encoder. Those two rows are marked
  `SEE_SOURCE_PAGE` / `manual_lookup` — open the page in a browser and read them.
  Decoding an anti-harvesting measure in bulk is exactly what it exists to stop.
- **No bot-protection or CAPTCHA bypass.** Pages behind a verification wall were
  skipped, not worked around.
- **No paid-aggregator scraping.** RocketReach / ZoomInfo / ContactOut show
  masked addresses (`d***@...`). None were used or guessed at.
- **No invented or pattern-guessed addresses.** Every address is printed on a
  page a human can open. There is no `firstname.lastname@` guessing in this file.

## Data hygiene notes

- 157 unique addresses across 159 rows, no duplicates, none malformed.
- **GM Daniel Naroditsky died in October 2025.** He is not in this file, and was
  explicitly checked for. If you extend the list from any older source, re-run a
  deceased check before sending — this is the single most damaging mistake this
  campaign could make.

---

# Second pass (same day) — full titled-coach sweep

After the GM-only pass, the brief widened to "collect emails like there is no tomorrow".

## Lichess, remaining 1,640 titled coaches — 460 emails

Same method and same rate limiting as the GM pass, run as two parallel streams:
all non-GM titled coaches in the directory (479 IM, 562 FM, 217 CM, 162 NM,
100 WFM, 83 WIM, 36 WGM, 1 LM). **460 of 1,640 (28%) publish an email.**

## FIDE Trainers' Commission — 12 new addresses

Crawled 372 posts across the commission's seminar, workshop and news categories.
These are seminar **organisers and lecturers**, so some are FIDE Senior Trainers
and some are arbiters or administrators. Tier `P6`, titles marked `unknown`.
Treat as the weakest rows in the file.

## Checked and rejected in this pass

- **chess.com coach directory.** Crawlable, and `/coaches` and `/member` are not
  disallowed by its robots.txt, but profiles carry no contact addresses — the
  platform routes everything through internal messaging. The only `@` strings on
  those pages are avatar filename hashes. No rows taken from chess.com.
- **FIDE federation directory** (`fide.com/federations`) — no addresses in the
  served HTML.
- **chessfactor, chess.run, nurtr, elitechesstraining** — no exposed addresses.
- **chess-results.com tournament organisers** — deliberately not crawled. High
  volume, but organisers are mostly clubs and arbiters rather than titled
  players, and padding the list with irrelevant recipients is how a sending
  domain gets burned.

## Final counts

645 rows, 643 unique addresses, zero duplicates, zero malformed, every row
carrying a source URL.
