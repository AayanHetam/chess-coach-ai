# Chess GM Outreach — contact dataset

Goal: reach chess Grandmasters to find a face / sponsor / mentor for Chess Masti.

## What's here

| File | What it is |
| --- | --- |
| `gm-contacts.csv` | 159 rows, **157 unique mailable addresses**. One row per GM or GM-fronted org. |
| `SOURCES.md` | Where every batch came from, and what was deliberately not done. |

### Columns

`priority, name, title, federation, email, contact_type, confidence, role_affiliation, source_url, verified_date, notes`

**priority**
- `P1-ambassador` (24) — public profile, real audience, or institutional pull. Best fit for "be the face of Chess Masti".
- `P2-active-coach` (127) — working GM coaches who published an email to solicit chess work. Highest reply probability.
- `P3-org` (8) — academy/club/foundation inboxes fronting several GMs each. Best route for sponsorship money.

**confidence**
- `verified` — printed on a page controlled by the GM or their employer
- `listed` — printed on a reputable third-party page
- `manual_lookup` — email exists on the source page but is obfuscated; open it in a browser (2 rows)

## Rules for this dataset (do not break these)

1. **Never invent an email.** Every address here is printed on a page a human can open. No `firstname.lastname@` guessing.
2. `source_url` is mandatory for every row.
3. Re-run a **deceased check** before any send. GM Daniel Naroditsky died in October 2025; he is not in this file.

## Honest note on the 500 target

500 GM emails is not reachable from public sources, and this is a supply problem, not an effort problem. There are roughly 1,750 living GMs. The overwhelming majority publish no contact address anywhere — elite players route through federations or agents, and most others simply have no public inbox. The single richest public vein, the Lichess coach directory, contains **324 GMs in total**, of whom 118 publish an email.

Realistic ceiling for genuinely verified GM addresses is a few hundred. What is here is the high-value part of that.

If volume is the goal, the ready extension is the **479 IM coaches** already identified in the same directory (usernames collected, roughly 170 more addresses at the observed 36% hit rate). That would put the list around 330 titled players. Worth saying: for "face of the brand", a well-known IM with an audience beats an anonymous 2500 GM.

## Before you send anything

Sending 500 cold emails from `chessmasti.com` would damage the domain, and there is a specific reason to care here. `CLAUDE.md` records that Resend deliveries already fail because `chessmasti.com` is not yet verified in DNS. Burning the domain's reputation with a cold blast would also break password-reset email for real users once that verification lands.

Send from a **separate domain** (e.g. `chessmasti.co`, `getchessmasti.com`), warm it over 2–3 weeks, and cap at 20–30/day. Keep `chessmasti.com` clean for transactional mail.
