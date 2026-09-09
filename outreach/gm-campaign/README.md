# Chess titled-player outreach — contact dataset

Goal: reach chess Grandmasters (and now titled players broadly) to find a face / sponsor / mentor for Chess Masti.

## What's here

| File | What it is |
| --- | --- |
| `gm-contacts.csv` | 645 rows, **643 unique mailable addresses**. |
| `SOURCES.md` | Where every batch came from, and what was deliberately not done. |

### Priority tiers — this is the send order

| Tier | Count | Who they are |
| --- | ---: | --- |
| `P1-ambassador` | 27 | Public profile, real audience, or institutional pull. The actual "face of Chess Masti" shortlist. |
| `P2-active-coach` | 127 | GM coaches who published an email to solicit chess work. |
| `P3-org` | 13 | Academy, club, federation and agency inboxes, each fronting several GMs. The sponsorship-money route. |
| `P4-im-coach` | 158 | IM coaches, same opt-in basis as P2. |
| `P5-titled-coach` | 308 | FM / CM / NM / WGM / WIM / WFM coaches. |
| `P6-fide-trainer-network` | 12 | Organisers and lecturers from FIDE Trainers' Commission seminar posts. **Titles unverified — these may not be titled players at all.** |

Title spread across the file: 155 GM, 158 IM, 143 FM, 66 CM, 29 WFM, 29 WIM, 25 NM, 16 WGM, plus 25 org/agency/federation inboxes and 12 unverified.

### Columns

`priority, name, title, federation, email, contact_type, confidence, role_affiliation, source_url, verified_date, notes`

**confidence**
- `verified` — printed on a page controlled by the person or their employer
- `listed` — printed on a reputable third-party page
- `manual_lookup` — email exists on the source page but is obfuscated; open it in a browser (2 rows)

## Rules for this dataset (do not break these)

1. **Never invent an email.** Every address here is printed on a page a human can open. No `firstname.lastname@` guessing.
2. `source_url` is mandatory for every row. All 644 have one.
3. Re-run a **deceased check** before any send, on the specific addresses in that
   batch. A corpus-wide sweep is not a substitute — see below.
   - GM Daniel Naroditsky died in October 2025; he is not in this file.
   - GM Ziaur Rahman died 5 July 2024, at the board during the Bangladesh
     Championship. He **was** in this file and was removed on 2026-09-08. See
     `deceased-exclusions.csv`.

   **Why the Lichess rows are the risk.** Lichess does not retire a coach profile
   when the coach dies. Rahman's profile at https://lichess.org/coach/ziachess
   still renders "Active" and "Accepting students" 26 months after his death,
   which is exactly how he entered this file with `confidence: verified`. Every
   P2/P4/P5 row comes from that directory, so "the profile says active" carries
   no signal about whether the person is alive.

   **Coverage of the automated phase (batches 3+).** The 100/day scheduled send
   cannot do a genuine per-batch name check, so the check was front-loaded on
   2026-09-09 against the whole remaining queue:

   - All 70 remaining GMs were checked by name against published 2023-2026
     chess obituaries. Clean. The 2026 GM deaths (Timman, Eingorn, Plachetka,
     Mokry, Parma) and the 2024-2025 ones (Naroditsky, Rahman, Enders, Neuman,
     Dueckstein, Franco Ocampos, Georgiev, Ionescu, Beshukov, Spassky) are none
     of them in this file.
   - The other 465 (IM/FM/CM/NM/W-titled coaches) were **not** checked by name.
     Published obituaries only exist for players notable enough for English
     coverage, which almost none of them are, so a name check on that cohort
     would return nothing and would not mean they are alive. This is a known,
     accepted gap, not an oversight.

   **The check that actually works** is per batch, not per corpus: before sending
   40, verify those 40 by name. Checking 600 by name is not tractable, and a
   sweep of published obituaries only catches players notable enough for English
   coverage — which is a small minority of this list.
4. One row per address — nobody gets mailed twice.

## On the 500 target

The list clears it, but not with 500 GMs. That specific number is not reachable: there are ~1,750 living GMs and most publish no contact address anywhere, since elite players route through federations and agents. The Lichess coach directory, the richest public vein by far, contains **324 GMs in total** — 118 of whom publish an email.

So the file is 154 GMs plus 458 other titled players, all of whom opted in to being contacted about chess work. For "face of the brand" that mix is arguably better than 500 anonymous GMs would have been: a known IM with an audience beats an unknown 2500 GM.

## Before you send anything

Do not send from `chessmasti.com`. `CLAUDE.md` records that Resend deliveries already fail because the domain is not DNS-verified. Burning its reputation with a cold blast would also break password-reset mail for real users once verification lands.

- Send from a **separate domain** (`chessmasti.co`, `getchessmasti.com`).
- Warm it 2–3 weeks before volume.
- Cap at 20–30/day. 643 addresses is roughly a month of sending.
- Work the tiers in order. P1 and P3 are where a "face of the brand" or sponsor actually comes from; P4/P5 are volume.

## Batch 1 send (2026-09-07)

Subject: **AI Chess Coach for Societal Good**. Copy is Aayan's own draft.
BCC on every message: akshajshriv10@gmail.com, vanchapradyun@gmail.com,
sehaam.mankotia@gmail.com.

Order is in `send-queue.tsv` (P1 ambassador tier first, P3 org inboxes last).
Progress is appended to `sent-log.tsv`. Pace is one email every 10 minutes,
driven by a self-scheduled wake-up, so the run takes about 6.5 hours.

### Gotcha worth remembering

Passing a bare URL in `body` makes the Gmail connector rewrite it, in the
stored MIME, to `https://www.google.com/url?q=...&source=gmail&ust=...` as
literal visible text. That reads as a phishing link. The fix is to pass
`htmlBody` as well with a real anchor (`<a href="https://chessmasti.com">
chessmasti.com</a>`), which keeps the visible text clean. Verified against
`get_draft` with `messageFormat: RAW`.

## Automated send (batches 3+, from 2026-09-09)

Batches 1 and 2 (90 emails) were sent by hand from a live session. Everything
after that is scheduled, so no session has to stay awake.

| File | What it is |
| --- | --- |
| `build-queue.py` | Builds the queue from `gm-contacts.csv`. Rerunnable, deterministic. |
| `queue-remaining.jsonl` | 535 rows. Each line is one **fully rendered** email: `to`, `subject`, `body`, `htmlBody`. The sending session does no templating. |
| `sent-log-remaining.tsv` | Append-only. `index<TAB>email<TAB>ISO8601<TAB>SENT`. **This file in git is the only thing preventing a double-send**, so a firing that sends must push before it exits. |
| `needs-manual-lookup.csv` | 5 contacts held out because their address cannot be sent without guessing at it. |

**No BCC.** Batches 1 and 2 blind-copied 3-4 addresses. Aayan dropped that on
2026-09-09, which also quadruples throughput: Gmail's free tier counts
*recipients*, not messages, so 1 recipient per send instead of 4 moves the
ceiling from ~125/day to 500/day.

**Cadence.** 5 firings a day, 20 emails each, 100/day. 535 rows is 5 days and
change. A missed firing costs 20 emails, never a burst, because each firing
sends a fixed 20 rather than "everything owed".

**How the queue was built** (`build-queue.py`, in order):
1. Drop rows whose `email` is not a valid address, plus the 3 scraper-mangled
   ones in `needs-manual-lookup.csv`.
2. Drop any address already in `sent-log.tsv` / `sent-log-batch2.tsv`.
3. Drop any row for a **person** already emailed at a different address. This is
   the rule that matters: Akash Ganesan and Cemil Aghamaliyev each hold multiple
   addresses and would otherwise have been mailed twice. Dedupe is on the human,
   not the address.
4. Salutation. `Dear {TITLE} {Surname} Sir,` / `Ma'am,` for the 517 rows where
   the surname is unambiguous. Where the automatic "last token" rule would be
   wrong the surname is hand-curated in `SURNAME` — Hispanic first-surname
   convention, Slavic and Hungarian surname-first order, South Indian trailing
   initials, compound surnames. Where no correct short form exists (Ethiopian,
   Vietnamese) the full name is used. 17 Lichess rows whose display name is a
   handle rather than a name get `Dear Coach,`.
5. The testimonial line adapts to the recipient's title, since only 70 of the
   535 are GMs: "IM testimonials like yours", "WGM testimonials like yours",
   and for the 12 untitled FIDE-trainer rows, "Testimonials from experienced
   coaches like you".
