# Partner creative assets

Served at `/img/p/*`. Not deployed itself — `.vercelignore` excludes `*.md`.

## Naming

Neutral on purpose. Common ad-blocker filter lists (EasyList and friends)
match request paths on substrings like `/ads/`, `banner`, `advert`, `sponsor`,
`promo` and dimension strings like `728x90`. Artwork served from a path
containing any of those silently fails to render for a large share of real
users, and the failure looks like a broken image rather than a blocked one.

`src/components/ads/__tests__/partnerBanner.test.ts` asserts this against the
paths the creatives actually emit, so renaming these files "more
descriptively" fails CI rather than failing in production.

## ChessUSA brand assets (Turn 2)

Extracted from the design doc, green knocked out to transparency. The `-c`
files are the cream knockouts, for dark grounds.

| File              | Intrinsic | Drawn at | Used by         |
| ----------------- | --------- | -------- | --------------- |
| `cu-lockup.png`   | 1024x220  | 209x45   | 2a, 2b — wide   |
| `cu-lockup-c.png` | 1024x220  | 209x45   | 2c — wide       |
| `cu-mark.png`     | 222x318   | 20x28    | 2a, 2b — narrow |
| `cu-mark-c.png`   | 222x318   | 20x28    | 2c — narrow     |

These are referenced as CSS `background-image`, never as `<img src>`, and that
is load-bearing rather than stylistic. All three creatives are rendered into
every page so the active one can be chosen by CSS without a hydration
mismatch; browsers fetch a hidden `<img>` but do not fetch a hidden
background-image. Switching to `<img>` would make every real visitor download
this artwork on every page view in order to display none of it.
`src/components/ads/__tests__/partnerSlot.test.tsx` asserts it.

There is no separate banner-sized image pair. The three units are HTML/CSS
built around these logos (`src/components/ads/chessusaTurn2.tsx`), and both
the production links and the older iframe shell serve the same three.
`PartnerBanner`'s `<picture>` path remains typed and supported should the
advertiser ever supply a finished PNG; nothing currently uses it.
