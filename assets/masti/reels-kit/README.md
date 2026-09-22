# Masti reels kit

Masti the Monkey for the Instagram reels and carousels built by
`Inspirit_project/content-engine` on the Mac. Copy this folder next to
`assets/` there. Nothing here needs a build step, a font, or the network.

Rebuild from a new animation pack with
`node scripts/masti/build-reels-kit.mjs --src <unzipped pack> --version v5`
(this repo); never edit the sprite sheets by hand.

## What is in it

| Path | What | Use |
| --- | --- | --- |
| `sprites/<mood>.webp` | horizontal sprite sheet, 300x375 per frame, alpha | animated Masti in a reel |
| `sprites/<mood>.json` | frames, frame size, delay per frame | the `data-*` attributes |
| `stills/<mood>.png` | 640-wide still, alpha | carousel slides, covers, frame 0 |
| `overlay/masti-overlay.css` | the `.masti` rules | include, or inline via `inline.mjs` |
| `overlay/masti-overlay.js` | frame stepping (`MastiOverlay.seek(ms)` / `play()`) | include after the stage |
| `overlay/masti-overlay.html` | copy-paste snippets | placement defaults |
| `overlay/inline.mjs` | prints the CSS with the sheets as `data:` URIs | anything rendered via `setContent` |
| `demo/*.html` | a reel frame and a carousel slide | open in a browser to eyeball |

Moods: `wave` (hello), `excited` (solve, win), `idea` (hint, "here's the
point"), `nervous` (uh-oh), `defeated` (dizzy), `thinking` (reading the board;
the art carries its own "give me a minute" bubble, so never add a second
speech bubble next to it).

## The rules the reels already pay for still apply

- **Board on screen at frame zero, and so is Masti.** He is an overlay on the
  first frame, not an intro. `masti-overlay.js` draws frame 0 synchronously on
  load; a title card with Masti alone is the intro we cut for an 87% skip rate.
- **Never over the board.** Bottom-left, under the board, inside the left half.
  Default: `left: 48px; bottom: 300px; height 320px` on 1080x1920. That keeps
  him clear of the Instagram caption band (bottom ~260px) and the action rail
  (right ~120px).
- **One Masti per frame.** Two on screen is a crowd, not a mascot.
- **The answer never appears in the video.** Masti reacts, he does not point at
  squares. No arrows, no highlighted destination, whatever the mood.
- **Silent** is unchanged. Nothing here has audio.

## Which mood, when

| Reel phase | Mood |
| --- | --- |
| goal + countdown (5 ticks x 1.6 s) | `thinking` |
| last tick | `nervous` (optional, keep it to one tick) |
| end card / link band | `excited` |
| carousel hook slide | `idea` (still, bottom-right, opposite the title) |
| carousel body slides | none, or a 180px `wave` still bottom-left |
| carousel end card | `excited` (still) |

Switch mid-reel with `MastiOverlay.setMood(el, "excited", spritesJson)`; the
next `seek()` starts that mood at frame 0.

## Rendering deterministically

The pipeline captures frames, so an animated image that plays in real time
would land on a different frame every run. The sheet plus a timeline fixes
that: before capturing the frame at time `t` ms, call

```js
await page.evaluate((t) => MastiOverlay.seek(t), t);
```

and Masti's frame is `floor(t / delayMs) mod frames`, identical on every
build. For real-time capture call `MastiOverlay.play()` once instead, or put
`data-autoplay` on the element. Do not mix the two in one render.

## `setContent` has no base URL

A relative `url("../sprites/wave.webp")` fails silently under Playwright's
`setContent`, exactly like a relative `<img src>`. Inline the sheets:

```sh
node overlay/inline.mjs thinking excited > /tmp/masti.css
```

and put that CSS in a `<style>` in the template. Only inline the moods the
reel uses; each sheet is 220-370 KB.

## Sizes

Sheets are 24 frames (idea 22, thinking 20) at 300x375, 220-370 KB each as
lossy WebP with alpha. At 320px rendered height that is a 0.85x downscale, so
they stay sharp at 1080x1920. For anything taller than 375px use the stills.
