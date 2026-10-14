# Partner webfonts

The typefaces the advertiser creatives in `src/components/ads/*Turn2.tsx` are
set in, served from this domain so that a real visitor's page load makes no
request to Google. Latin subsets only: every creative's text is English.

| File | Family | Weights | Source |
| --- | --- | --- | --- |
| `archivo-latin.woff2` | Archivo (variable weight axis; declared for 600 to 800, the weights the creatives use) | 600, 700, 800 | Google Fonts, Archivo v25 |
| `ibm-plex-mono-600-latin.woff2` | IBM Plex Mono | 600 | Google Fonts, IBM Plex Mono v20 |
| `ibm-plex-mono-700-latin.woff2` | IBM Plex Mono | 700 | Google Fonts, IBM Plex Mono v20 |
| `source-serif-4-700-latin.woff2` | Source Serif 4 | 700 | Google Fonts, Source Serif 4 v15 |

All three families are licensed under the SIL Open Font License 1.1; the
licence and copyright notice for each is the `OFL-*.txt` beside it.

The `@font-face` rules that reference these files are emitted into every
page's `<head>` by `partnerSlotCss` (`src/components/ads/PartnerSlot.tsx`),
built from the `fonts` list of each entry in `src/components/ads/partners.ts`.
A browser only downloads a face once text on the page is set in it, so a page
with no banner downloads none of these. The directory is versioned (`v1/`)
and served with a one-year immutable cache header (`next.config.js`): a
changed file is a new directory, never an edit in place.
