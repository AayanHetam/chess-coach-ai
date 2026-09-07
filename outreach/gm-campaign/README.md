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
2. `source_url` is mandatory for every row. All 645 have one.
3. Re-run a **deceased check** before any send. GM Daniel Naroditsky died in October 2025; he is not in this file.
4. One row per address — nobody gets mailed twice.

## On the 500 target

The list clears it, but not with 500 GMs. That specific number is not reachable: there are ~1,750 living GMs and most publish no contact address anywhere, since elite players route through federations and agents. The Lichess coach directory, the richest public vein by far, contains **324 GMs in total** — 118 of whom publish an email.

So the file is 155 GMs plus 458 other titled players, all of whom opted in to being contacted about chess work. For "face of the brand" that mix is arguably better than 500 anonymous GMs would have been: a known IM with an audience beats an unknown 2500 GM.

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
