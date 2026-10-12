# Chess Masti design rules

How the site looks and moves, and the rules every edit follows. Written for whoever changes a screen, person or agent, so that no judgement call is needed: a value is a token, a tell has one fix, a component has one recipe. Sources: Emil Kowalski's apple-design skill (Apple's WWDC talks translated for the web), Apple's own web code (the Swift-DocC renderer, swift.org, apple.com) and the Human Interface Guidelines. Tokens live in `src/theme/tokens.ts`; the theme that applies them is `buildChessMastiTheme()` in `src/theme/chessMasti.ts`. The home page (`src/pages/index.tsx`, `src/components/landing/*`) is the reference implementation. Updated 2026-10-12.

## 1. Why

The site was built in an "Obsidian-Glass" style: blurred gradient orbs behind every page, frosted-glass cards with an inset highlight, orange glow shadows, gradient headlines and gradient buttons, a rotating border beam, a cursor spotlight, uppercase letter-spaced micro-labels, scroll-reveal choreography with staggered delays, marquees, count-up tickers, hover lifts, sparkle icons, a jewel colour per product area and copy full of jargon. That is what a page looks like when nobody decided anything. The new discipline is Apple's: purpose, restraint and craft, with one accent, flat opaque surfaces, size-specific type, feedback on press and nothing that moves on its own. The site stays dark. Think Apple's dark mode and apple.com's black product pages, not a light theme. Dark was never the problem; decoration was.

## 2. The eight principles, applied here

1. **Purpose.** Every element spends the user's attention. Orbs, beams, spotlights, marquees, tickers and sparkles are deleted as components, not restyled, so they cannot come back.
2. **Agency.** No auto-scrolling strips, no count-ups the reader waits for, no input locked during a transition. Confirmation only for deleting a saved game or resetting a course; everything else is undoable or harmless.
3. **Responsibility.** Masti's notes come from a language model and the coach panel says so once, in plain words. The engine owns chess truth; the UI never implies the coach verified a line it did not.
4. **Familiarity.** One button system, one card, one nav in one place with the same labels on every route. The flat home page is the pattern every other page copies.
5. **Flexibility.** Phone-first on the viewport-locked `/analysis` and `/puzzles`: 44px targets, no hover-only affordances, spacing in theme units so text zoom reflows instead of clipping.
6. **Simplicity, not minimalism.** One filled surface level per region; group with spacing and hairlines; the common path first, advanced options one level deeper, never in a tile.
7. **Craft.** Nothing is random: every colour, size, radius and timing is a token. A reviewer can grep for anything outside the ladders in section 3.
8. **Delight.** Masti is the delight budget: his moods, his bubbles, his bounded loops. Nothing competes with him.

Tactical rules that follow: feedback is one of status, completion, warning or error, inline and at the moment it applies; every screen answers where am I, where can I go, what is here, how do I get out; a control sits next to what it changes (board toggles under the board); nav items name their contents (Plan, Play, Analyze, Practice, Learn, Scout), never Hub, Dashboard, Journey or Insights.

## 3. Tokens

All values are in `src/theme/tokens.ts`. Import them; never retype them.

### 3.1 Surfaces and lines (dark, opaque, Apple's dark-mode system values)

| Token | Value | Use |
| --- | --- | --- |
| `SURFACE.page` | `#000000` | The page. `body` gets it from the baseline; pages paint no background of their own. |
| `SURFACE.raised` | `#1C1C1E` | A card, a panel, a list group, MUI Paper. |
| `SURFACE.raisedSecondary` | `#2C2C2E` | A control, an input, a row or a nested block on a raised surface. Never a second card. |
| `SURFACE.raisedTertiary` | `#3A3A3C` | A hovered or pressed row, a tooltip. |
| `SURFACE.overlay` | `#1C1C1E` | Menus, popovers, dialogs, snackbars. Opaque. |
| `LINE.hairline` | `rgba(255,255,255,0.10)` | Every border on a dark surface. |
| `LINE.separator` | `rgba(84,84,88,0.65)` | Dividers inside a list. |
| `LINE.strong` | `rgba(255,255,255,0.18)` | An outlined control, a floating layer's edge. |

Hover on a surface or on chrome: `rgba(255,255,255,0.06)`. Selected: `rgba(255,255,255,0.10)`. The theme exposes both as `palette.action.hover` and `palette.action.selected`.

### 3.2 Text

| Token | Value | Contrast on page / card | Use |
| --- | --- | --- | --- |
| `TEXT.primary` | `#F5F5F7` | 18:1 / 16:1 | Headings, body, labels, icons at rest. |
| `TEXT.secondary` | `rgba(235,235,245,0.60)` | 6.3:1 / 5.9:1 | Supporting lines, meta, secondary icons. |
| `TEXT.tertiary` | `rgba(235,235,245,0.30)` | 2.3:1 / 2.5:1 | Placeholders, disabled text, decorative meta only. Never for text a user must read. |
| `TEXT.onAccent` | `#0A0A0A` | 7:1 on ember | Text on an ember button. |

### 3.3 Accent and status

One accent, the brand's ember. It is used for exactly four things: the primary button fill, links, the fill of a selected toggle or segment, and Masti's hoodie. Never a border glow, a gradient, a heading colour, a hover wash, an icon at rest or the fill of a large area.

| Token | Value |
| --- | --- |
| `ACCENT.main` | `#F97316` (7.5:1 on the page) |
| `ACCENT.hover` | `#FB923C` |
| `ACCENT.active` | `#EA580C` |
| `ACCENT.tint` | `rgba(249,115,22,0.14)`, a selected state or a tag background |
| `ACCENT.border` | `rgba(249,115,22,0.45)`, a selected control's hairline |

Status, Apple's dark-mode system colours, used only to carry status: `STATUS.success #30D158`, `STATUS.warning #FFD60A`, `STATUS.error #FF453A`, `STATUS.info #0A84FF`, each with a `*Tint` at 14% for banners and chips (full-strength colour on the icon or the word, never on a large fill). Validation, engine health, puzzle result and save state draw from these four and nothing else.

### 3.4 Type

Font stacks, defined once: `FONT_SANS` is `-apple-system, BlinkMacSystemFont, system-ui, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Helvetica, Arial, sans-serif`; `FONT_MONO` is `ui-monospace, "SF Mono", SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace`. No webfont is downloaded; Inter is gone. `SERIF_DISPLAY` (`src/theme/fonts.ts`) is allowed on exactly two things, the puzzle prompt line and a motif name inside the puzzle card, and nowhere in chrome.

| Role | px | Weight | Line height | Tracking | Where |
| --- | --- | --- | --- | --- | --- |
| `TYPE.display` | 56 | 700 | 1.07 | -0.025em | The home h1 only, via `clamp()`. |
| `TYPE.h1` | 40 | 700 | 1.10 | -0.02em | One per page. |
| `TYPE.h2` | 28 | 600 | 1.15 | -0.015em | A section. |
| `TYPE.h3` | 22 | 600 | 1.20 | -0.01em | A card heading. |
| `TYPE.h4` | 19 | 600 | 1.25 | -0.005em | A dialog title, a panel heading. |
| `TYPE.h5` | 17 | 600 | 1.30 | 0 | A row title. |
| `TYPE.body` | 17 | 400 | 1.50 | 0 | Anything read for more than a sentence: coach text, lessons, dialogs. |
| `TYPE.bodySmall` | 15 | 400 | 1.45 | 0 | Dense UI: side panels, move lists, forms, chips. |
| `TYPE.caption` | 13 | 400 | 1.40 | +0.005em | Meta, timestamps, secondary rows. |
| `TYPE.label` | 13 | 600 | 1.30 | +0.005em | A group label above controls. Sentence case. |

Floor: 12px (`0.75rem`), only for legal lines and tooltips. Anything a user taps or clicks is 13px or larger. Weight 800 appears only in Masti's hero bubble. Monospace is 15px/1.4 and only for SAN, PGN, FEN and engine lines; numbers in prose (ratings, clocks, evals, counts, move numbers) stay in the body font with `fontVariantNumeric: "tabular-nums"`. Prose is left-aligned at `maxWidth: "65ch"`, never justified.

### 3.5 Radius, spacing, borders, shadows

| Token | Value | Use |
| --- | --- | --- |
| `RADIUS.small` | 8 | Chips, tags, menu rows, list rows. |
| `RADIUS.control` | 10 | Inputs, icon buttons, segmented controls, banners, menus. |
| `RADIUS.card` | 16 | Cards, list groups, the nav. |
| `RADIUS.sheet` | 20 | Dialogs, sheets, the drawer. |
| `RADIUS.pill` | 980 | Pill buttons and pressable chips only. Never a container, a badge or a status dot. |

Spacing is MUI's 8px unit (`theme.spacing`); nothing is a fixed px tied to a font size. Between page sections `mt: { xs: 6, md: 8 }` (48/64px); inside a card `p: { xs: 2, md: 3 }`; between a label and its control `0.5`; between related controls `1`; between unrelated groups `2` to `3`. The content column is `maxWidth` 1120 (home) or 1280 (product pages), `px: { xs: 2, md: 4 }`, `mx: "auto"`. Breakpoints are MUI's defaults.

Borders are 1px hairlines in `LINE.*`. Nothing on the page casts a shadow: a card is a surface, not an object. Only floating things do, and only neutral black: `SHADOW.floating` (`0 4px 16px rgba(0,0,0,0.35)`) for menus, popovers, tooltips, snackbars, the consent banner; `SHADOW.modal` (`0 16px 48px rgba(0,0,0,0.5)`) for dialogs, the drawer, a sheet. A floating layer also carries a `LINE.hairline` edge, because shadows read weakly on black. A border and a wide shadow never define the same in-flow edge.

## 4. Materials

Translucency is a floating functional layer with content scrolling under it, nothing else. Three surfaces on the site qualify and each has one recipe:

| Surface | Recipe |
| --- | --- |
| Nav (`NavPill`) | `background: MATERIAL.background` (`rgba(28,28,30,0.72)`), `backdropFilter: MATERIAL.backdropFilter` (`saturate(180%) blur(20px)`), `border: 1px solid MATERIAL.border`, `...MATERIAL_FALLBACK_SX`. |
| Drawer sheet (`AppDrawer`) | `rgba(28,28,30,0.90)`, `saturate(180%) blur(24px)`, `border: 1px solid LINE.strong` on the open edge, `boxShadow: SHADOW.modal`, `...MATERIAL_FALLBACK_SX`. Heavier because it is bigger. |
| Consent banner | The nav recipe plus `SHADOW.floating`. |

Everything else is opaque: cards, panels, rows, chips, inputs, banners, the board, Masti's bubble, and the floating things MUI draws (Dialog, Menu, Popover, Tooltip, Snackbar) which the theme paints `SURFACE.overlay` with a hairline and a neutral shadow. A menu opening from the translucent nav is therefore solid, so no translucent layer ever sits on another. Nothing translucent ever sits over a board in play, and Masti never renders on a translucent layer above one. The modal scrim is `MATERIAL.scrim` (`rgba(0,0,0,0.5)`) with no blur; non-blocking panels (the coach column, filters) have no scrim and no blur.

Text on a material is `TEXT.primary` at weight 500 or 600 and never coloured; icons on it are white at 0.94 or 0.62, never ember at rest. Where floating chrome overlaps a scrolling list, the list fades at the edge (`maskImage: linear-gradient(to bottom, transparent 0, #000 24px, #000 calc(100% - 24px), transparent 100%)`) instead of a hard divider; everywhere else a divider is a plain hairline.

Fallbacks are declared once in `MATERIAL_FALLBACK_SX` and spread onto every translucent surface: `@media (prefers-reduced-transparency: reduce)` and `@supports not (backdrop-filter: blur(1px))` make it `SURFACE.overlay` with no filter; `@media (prefers-contrast: more)` makes it `SURFACE.overlay`, no filter, `LINE.strong` border. Components stop checking these queries individually.

Dark-only is a decision for the product: `palette.mode` is `"dark"` in the product theme and the home theme, with `html { color-scheme: dark }` so native controls and scrollbars match. The App Router's `ThemeRegistry` builds the same theme in light mode because the legal pages (`contentPageStyles`) are light; the SEO pages paint their own dark shell (`PageShell`). Scrollbars are neutral (`rgba(255,255,255,0.18)` thumb) from the baseline, never per page.

## 5. Motion

- **Press on pointer-down, globally.** `MuiButtonBase` root carries `"&:active": { transform: MOTION.pressScale }` (0.97) with `transition: transform MOTION.press` (100ms ease-out), `touchAction: "manipulation"` and `WebkitTapHighlightColor: "transparent"`. A custom pressable Box copies those four lines. Wide things (rows, card links) darken instead of scaling: `"&:active": { backgroundColor: SURFACE.raisedTertiary }`. Commit on pointer-up; allow cancel by dragging away.
- **Hover is a colour change.** Background one ladder step lighter, or `rgba(255,255,255,0.06)` on chrome, over `MOTION.hover` (160ms ease-out). Never `translateY`, never `scale` up, never a shadow change, never a spotlight.
- **State changes** (tab switch, panel swap, expand, chip select): 160ms for colour and opacity, 200ms (`MOTION.enter`) for a panel swap with at most 8px of translate. Only `transform` and `opacity` animate; `will-change` only while a gesture is live. Transitions name their properties; `transition: "all"` is forbidden.
- **Springs for anything a finger drags** (sheet, drawer, reorder): `MOTION.springSheet` = `{ type: "spring", bounce: 0, duration: 0.4 }` (Apple damping 1.0, response 0.4), re-targeting from the current value so a closing sheet grabbed again follows the finger. After a flick with real velocity only: `MOTION.springFlick` = `{ bounce: 0.2, duration: 0.4 }`, passing the release `velocity` and targeting the snap point nearest `current + (v/1000) * 0.998 / (1 - 0.998)`. X and Y are separate springs. Nothing that merely appeared bounces. No `pointer-events: none` during a transition; no `once: true` gating.
- **Same path in and out, anchored origin.** `CommandPalette` enters from `translateY(-8px)` and leaves to `translateY(-8px)`; `AppDrawer` slides in from and out to the left; snackbars from the bottom; menus and popovers set `transformOrigin` to their trigger (MUI `anchorOrigin`/`transformOrigin`) and scale from 0.96; dialogs scale 0.96 to 1 from the centre with the scrim because they are modal tasks. Exit uses `MOTION.exit` (160ms) on the mirrored path.
- **Delete outright:** `GradientBackdrop`, `BorderBeam`, `Spotlight`, `MarqueeStrip`, `BentoCard`, `NumberTicker`'s count-up (`formatTickerValue` stays), `useInView` plus `initial`/`animate` reveals, `revealDelay`, `animationDelay: i * 0.15s` staggers, `FadeIn` with a `delay`, `whileHover`, `repeat: Infinity`, the `pulse`, `pulse-badge`, `cmGlow`, `shimmer`, `cmEvalBarPulse` and `puzzleCoachCursor` keyframes, hover lifts, and every `transition: "all"`.
- **Keep, as the only cross-fades:** a new chat message (`FadeIn`, opacity only, 180ms, no y offset, no delay); a dialog or menu opening (`MOTION.enter`); a right-column tab swap (`AnimatePresence` with a `key` per branch, opacity only, 160ms); a segmented control's indicator sliding 200ms to the selected item (never following hover). Real activity gets one indicator: `CircularProgress size={16}` or a three-dot opacity pulse beside the status text, removed the frame the result lands. The brand `Loader` keeps its ring rotation as the one full-page loading animation, in `TEXT.secondary` by default, static under reduced motion. Skeletons are static `rgba(255,255,255,0.06)` blocks.
- **First frame is the final layout.** Content is visible from the first paint; `dynamic(ssr: false)` always has a `loading` of the final height; a swap gives each branch its own `key`. The CLS budgets in `tests/e2e/local/layout-stability.spec.ts` measure this.
- **Reduced motion.** `GLOBAL_CSS` in the baseline shortens every animation and transition to near zero under `prefers-reduced-motion: reduce`; `<MotionConfig reducedMotion="user">` wraps both app roots (`src/pages/_app.tsx`, `src/components/ThemeRegistry.tsx`) so framer springs cross-fade instead of sliding. Components stop checking individually, except Masti's `useMastiMotion`, which also gates on hidden tabs and off-screen. No full-viewport moving background, no loop near 0.2 Hz, no parallax. A theme or board colour change eases over 200ms, never a brightness jump.
- **Masti is the one character animation:** a bounded number of loops after mount, still on the server and first paint, never over a board in play, never under reduced motion. Nothing else on a page loops.

## 6. Typography rules

- Hierarchy is weight, size and leading as a set, from the table in 3.4. Never colour, caps or tracking. Emphasis inside a line is weight 600, never ember, never a gradient.
- Sentence case everywhere: headings, buttons, labels, chips, tabs, table headers. `textTransform: "uppercase"` is allowed only on a two-to-four-letter abbreviation that is naturally capitals (FEN, PGN, UCI).
- No eyebrow or overline labels above a heading. Fold the information into the heading or the line under it: "TWO QUESTIONS · STEP 1 OF 2" becomes "Step 1 of 2" as `TYPE.caption` in `TEXT.secondary`. A true group label is `TYPE.label`.
- `letterSpacing`, `textTransform` and `fontFamily` are set in `src/theme/` only. After the sweep `rg "letterSpacing|fontFamily:" src --glob '!src/theme/**'` returns nothing (the `tabular-nums` rule is `fontVariantNumeric`, not `letterSpacing`).
- Minimum sizes by role: 17px for prose, 15px for operational UI, 13px for labels and meta, 12px only for legal and tooltips. Nothing below 12px, nothing at `0.6rem` or `0.7rem`.
- One `h1` per page, then `h2`, `h3` in order; visual size comes from the `variant` or `TYPE.*`, never from skipping a level.
- Four monospace stacks become one (`FONT_MONO`); "Monaco, Menlo, monospace" and "Inter, sans-serif" literals are replaced on sight.

## 7. Colour rules

- One accent. The primary action on a screen is the only solid ember; every other clickable thing is outlined, text, or a tinted chip. Links are ember (`MuiLink` colour is `ACCENT.hover`).
- Text is `TEXT.primary` or `TEXT.secondary`. `TEXT.tertiary` fails 4.5:1 and is for placeholders, disabled states and purely decorative meta. Never grey text on a coloured background; on an ember button the text is `TEXT.onAccent`.
- Status colours carry status only (a success border on a solved puzzle, an error line, a warning banner), never decoration. Every status also carries a word or an icon so colour is never the only channel.
- No gradients: `linear-gradient`, `radial-gradient`, `conic-gradient` and `backgroundClip: "text"` return zero hits under `src/` except `maskImage` scroll fades, the board's check-square highlight in `AnalysisImpl` and `boardTheme.ts` (chess rendering). Purple and violet (`#A855F7`, `#7B61FF`, `rgba(123,97,255)`) leave the codebase. Recharts area fills become one flat 12% ember fill.
- No glow: no `boxShadow` with a colour, no `0 0 Npx` ring, no `filter: blur()`, no inset top highlight.
- Category colours (`src/components/ui/accents.ts`): product surfaces get no identity colour; `SURFACE_ACCENTS` and `surfaceAccent` are deleted once the sweep has removed their last use. `themeAccent()` stays for puzzle themes and course tags only, on a chip at most 24px tall: `accent.soft` background, `accent.bright` text. Never on a card border, tint, glow, heading, icon medallion or chrome. The `glow` field is `"none"` and goes with `surfaceAccent`. `src/sections/learn`'s 3px character-coloured left edge on a choice card is a category marker pinned by `learn-repertoire.spec.ts` and stays.
- Move classifications (brilliant to blunder) are the one legitimate multi-hue set because each hue carries meaning: a glyph colour and a 14% chip background, with an icon and a word, never a glow, gradient or card border.
- Icons are `lucide-react` at 16 to 20px, `strokeWidth` 1.75, in `TEXT.primary` (active) or `TEXT.secondary` (secondary) at rest, ember only when a link or the selected item, semantic when reporting status. They stand on their own, never inside a tinted circle or square. A file that is edited moves its `@iconify` and `@mui/icons-material` imports to lucide; brand marks (the Google sign-in mark) are exempt.
- Chess board colours, piece sets, square highlights, the legal-move dot, the capture ring, the eval bar's white and black and the arrow brushes are chess rendering, not this system. Untouched.

## 8. Copy rules

Plain language, sentence case, short sentences. Say what the user can do and what changes for them; name the real thing (Masti, Stockfish, the London, your last game). The register is the home page: "I'm Masti, your chess coach." / "Play, practice, and learn. Free for everyone."

- Buttons are a verb plus the object: "Analyze game", "Next puzzle", "Save game", "Start lesson", "Show the line". Not "Get started", "Learn more", "Explore", "Dive in". The home "Let's go" is the established exception. Spell it "Analyze", not "Analyse".
- Nav and section labels name their contents: Play, Puzzles, Analysis, Learn, Plan, Profile.
- Status and errors say what happened and what to do, in that order: "The engine didn't answer. Try again." / "Saved." / "Sign in to keep this game." Never "Something went wrong", "Oops", "Uh-oh".
- No exclamation marks except in Masti's own bubble, at most one per screen. No emoji in chrome, labels, headings or errors (Masti's face is the emoji). No "NEW" badges, no "Pro tip", no "Welcome back, Name!". No ellipses as suspense.
- No em dashes in UI strings: a comma, a period or a colon. (Three are pinned by tests and change together with their tests: `masterGamesPanel.test.ts:301`, `coach-history.spec.ts:223`, the greeting at `AnalysisImpl.tsx:1059`.)
- Real numbers without inflation: "1,240 puzzles", not "1000+". No hero metric strip.
- Labels explain nothing the layout should: if a control needs a sentence, move it next to what it affects or cut it. Tooltips only on icon-only buttons and they are the verb ("Flip board").
- Masti's fun tone lives in his bubble content; the chrome around him is neutral. The product is 13+ and title-neutral: keep copy clear of `audiencePositioning.test.tsx` and the 20-word hero budget in `home.test.tsx`.
- One plain disclosure where the coach panel first appears: "Masti's notes are written by an AI model."

| Jargon | Plain |
| --- | --- |
| AI-powered, powered by AI, LLM, Claude (as a feature) | Masti, your coach |
| Engine-grounded, engine-first, Stockfish-grounded | Checked against the engine (or drop) |
| Engine-validated, hallucination validator, validated claims, validation pipeline | Every claim is checked |
| Stockfish 17, Stockfish 17 WASM (as a selling point) | The engine (or "Stockfish 16, depth 20" where the number is the fact) |
| Neo4j graph, 100,000+ position graph, Neo4j similar puzzle | Puzzles chosen for you |
| Maia-2 humanlike opponent | A human-like opponent |
| Insights | What to fix, Notes, Mistakes |
| Unlock | Start, Open |
| Journey | Plan, progress |
| Smart, Intelligent, Personalized | (drop) or "for your rating", "from your games" |
| Master your openings | Learn the London (name the opening) |
| Grandmaster-level analysis | Stockfish, depth 20 |
| Deep dive, Deep-dive opening tree | Look at, Opening tree |
| Supercharge, unlock, elevate, level up, unleash, transform | Get better at X (or drop) |
| Seamless, effortless, powerful, world-class, cutting-edge, next-level, blazing, endless | (drop) |
| Experience (noun), Takeover, power users, Lab, Studio, Hub | (drop) |
| Obsidian, glass, ember, jewel (in UI copy) | (drop) |
| Served from server cache (10-min TTL) | Cached a few minutes ago |
| AI coaching is paused | Masti is paused |

## 9. Tell to fix

Patterns are `rg` regexes over `src/` excluding `__tests__`, `src/components/ads/**` and `src/lib/**` unless a row says otherwise. Each row has one fix.

| Tell | Grep | Fix |
| --- | --- | --- |
| Gradient orbs behind the page | `GradientBackdrop\|blur\(80px\)\|radial-gradient\(circle, rgba\((249\|123)` | Delete the element and its import. The page paints nothing; `body` is `SURFACE.page`. |
| Dot-grid texture | `backgroundSize: ?"32px 32px"\|circle at 1px 1px` | Remove the pseudo-element and its mask. |
| Glass on content | `backdropFilter\|WebkitBackdropFilter\|saturate\(1[0-9]{2}%\)` | `background: SURFACE.raised`, `border: 1px solid LINE.hairline`, `borderRadius: RADIUS.card`. Allowed only in NavPill, AppDrawer, ConsentBanner and `tokens.ts`. |
| Dark-glass fills | `rgba\((20, ?22, ?28\|12, ?14, ?20\|22, ?18, ?14), ?0\.` | `SURFACE.raised` or `SURFACE.raisedSecondary`. |
| Inset top highlight | `inset 0 1px 0 rgba\(255` | Remove. The hairline is the edge. |
| Coloured glow | `boxShadow[^\n]*rgba\((249\|34\|239\|168\|251\|255), ?[0-9]+, ?[0-9]+\|0 0 [0-9]+px\|\.glow\b` | Remove. Floating things use `SHADOW.floating` or `SHADOW.modal`; in-flow `boxShadow: "none"`. |
| Gradient text | `WebkitBackgroundClip\|backgroundClip: ?"text"\|WebkitTextFillColor` | `color: TEXT.primary`, weight from the scale. Delete `background`. |
| Gradient fills and borders | `linear-gradient\|radial-gradient\|conic-gradient\|#A855F7\|#7B61FF\|123, ?97, ?255` | A solid: `ACCENT.main` for the primary action, `SURFACE.*` for surfaces, `ACCENT.tint` for selected. Allowlist: `maskImage` fades, board CSS. |
| Gradient primary button | `linear-gradient\(135deg, ?#F97316\|0 4px 14px rgba\(249\|0 6px 18px rgba\(249` | `<Button variant="contained">` from the theme (recipe 10.3). |
| Border beam | `BorderBeam\|beam(Delay)?=\|repeat: ?Infinity` | Delete the component and the props. A featured card is first and biggest, or has a `LINE.strong` border. |
| Spotlight | `Spotlight\|--mx\|--my\|addEventListener\("mousemove"` | Delete. Hover on a card link is `background: SURFACE.raisedSecondary`. |
| Uppercase eyebrow | `textTransform: ?"uppercase"\|variant="overline"\|letterSpacing: ?"0\.(0[6-9]\|1[0-9])em` | Delete the eyebrow, or `TYPE.label` sentence case with `letterSpacing: 0`. |
| Any component tracking or font | `letterSpacing:\|fontFamily:` outside `src/theme/` | Remove; the variant carries it. `FONT_MONO` for notation. |
| Sparkle icons | `Sparkles\|AutoAwesome\|AutoAwesomeIcon` | Remove the icon. Where a face is wanted, `MastiAvatar` at 32px or larger, still. |
| Icon medallion | an icon inside a Box with `borderRadius: "50%"\|RADIUS.small` and an `accent.soft` or tint fill | The bare icon at 18 to 20px in `TEXT.secondary`. |
| Scroll reveal and staggers | `` useInView\|revealDelay\|initial=\{\{ ?opacity: 0\|animationDelay: ?`\$\{i\|transitionDelay\|<FadeIn[^>]*delay= `` | Render visible from the first frame. A panel swap is a 160ms opacity cross-fade with a `key` per branch. |
| Hover lift or scale | `whileHover\|translateY\(-[0-9]px\)\|scale\(1\.0[0-9]+\)\|transition:[^\n]*box-shadow` | Hover: background one step lighter. Press: `MOTION.pressScale`. |
| Infinite loops on static status | `infinite\|@keyframes (pulse\|shimmer\|cmGlow\|pulse-badge\|puzzleCoachCursor\|cmEvalBarPulse)` | Static 8px status dot. Real activity: `CircularProgress size={16}` or the three-dot indicator. Skeleton: static block. |
| Marquee, ticker | `MarqueeStrip\|marquee\|NumberTicker\|useMotionValue` | Delete; render the final formatted value. |
| Jewel chrome | `ACCENTS\.\|surfaceAccent\|SURFACE_ACCENTS\|\.(tint\|border\|soft)\b` on a card, nav, menu, scrollbar or button | Neutral ladder. `themeAccent()` only on a tag chip. |
| Accent-tinted hover | `rgba\(249, ?115, ?22, ?0\.(0[5-9]\|1[0-9]\|2[0-9])\)` as a hover or menu-row background | Hover `rgba(255,255,255,0.06)`, selected `rgba(255,255,255,0.10)` with weight 600. |
| Pill container | `borderRadius: ?"999px"\|borderRadius: ?999\|RADIUS\.pill` on anything that is not a button or pressable chip | `RADIUS.small` (tag) or `RADIUS.control` (container). |
| Nested cards, extreme radii | `borderRadius: ?"1\.5rem"\|borderRadius: ?"1rem"\|borderRadius: ?(3\|4)\b` | One filled level per region; `RADIUS.card` outside, hairlines and spacing inside. |
| Bento grid | `BentoCard\|gridColumn: ?"span` | A vertical list or at most two columns sized to content. |
| `transition: all` | `transition: ?"all` | Name the properties: `background-color MOTION.hover, color MOTION.hover, border-color MOTION.hover`. |
| Custom curves, long durations | `cubic-bezier\(0\.22, ?0\.61\|duration: ?0\.[5-9]\|ease: ?\[` | `MOTION.hover`, `MOTION.enter`, or a `MOTION.spring*`. |
| Tiny text | `fontSize: ?"?0\.(5[0-9]\|6[0-9]\|7[0-4])rem\|fontSize: ?(10\|11)\b` | `TYPE.caption` (13px) or 12px for legal only. |
| Mono literals | `fontFamily: ?"(Monaco\|monospace\|ui-monospace\|Inter)` | `FONT_MONO` or remove (sans inherits). |
| No focus style | `outline: ?"?none` without an `&:focus-visible` sibling | `"&:focus-visible": { outline: "2px solid #FFFFFF", outlineOffset: 2 }` (`-2` inside translucent chrome). |
| Inline paper overrides | `slotProps=\{\{ ?paper\|PaperProps=` adding blur, gradient or a glass fill to Dialog, Menu, Popover, Tooltip, Alert, Snackbar | Remove; the theme styles them. |
| Page-local theme | `createTheme\(` outside `src/theme/` and `launchTheme.ts` | Delete; Layout already provides `buildChessMastiTheme()`. |
| Page-local scrollbar rule | `::-webkit-scrollbar-thumb` in a page | Delete; the baseline owns it. |
| Elevation on a page card | `elevation=\{[1-9]` | `elevation={0}` or `variant="outlined"`. |
| Legacy orange, slate navy | `#FF6B35\|#FF8C42\|#FFB88A\|255, ?107, ?53\|#0b1120\|#0f172a\|#1e293b\|#1a2332\|#111c38` | `ACCENT.*` and `SURFACE.*`. |
| Tailwind status literals | `#fca5a5\|#86efac\|#FBBF24\|#4ADE80\|#f87171\|239, ?68, ?68\|34, ?197, ?94` | `STATUS.*`. Two literals are pinned by `puzzle-analyse.spec.ts` and `puzzle-rail.spec.ts`; widen the regex in the same PR or keep those two. |
| Jargon | `AI-powered\|Insights?\b\|Unlock\|journey\|\bSmart\b\|Master your\|Powerful\|Level up\|Elevate\|Seamless\|Supercharge\|Unleash\|cutting-edge\|Experience the\|Dive in\|engine-grounded\|hallucination validator\|Neo4j` in `src/pages`, `src/components`, `src/sections`, `src/app` | The table in section 8. |
| Em dash in a UI string | the character U+2014 inside a JSX text node or a string literal rendered to the user (`rg -n $'\u2014'`) | A comma, period or colon. |

## 10. Component recipes (MUI sx)

Every interactive recipe carries, from the theme or by hand: `"&:focus-visible": { outline: "2px solid #FFFFFF", outlineOffset: 2 }`, `"&:active": { transform: MOTION.pressScale }` (or the darkening for wide things), `touchAction: "manipulation"`, a 44px hit target on the phone layouts (`minHeight: { xs: 44 }` on `size="small"` controls), 40px icon buttons, 32px chips. A clickable card is a real `<a>` (`component={Link}`) or `<button>`, never a `div onClick`. Dialogs and sheets trap focus, close on Escape and have a visible close button. Engine, coach and puzzle results announce through an `aria-live="polite"` region; loading indicators carry `role="status"` and a text label; decorative Masti figures are `aria-hidden`.

1. **Page frame.** No background of its own. `<Box sx={{ maxWidth: 1280, mx: "auto", px: { xs: 2, md: 4 }, py: { xs: 3, md: 5 } }}>`. Self-chromed routes (`SELF_CHROMED_ROUTES` in `src/sections/layout/index.tsx`) mount `<NavPill active={id} />` themselves and nothing else.
2. **Card.** `` { background: SURFACE.raised, border: `1px solid ${LINE.hairline}`, borderRadius: `${RADIUS.card}px`, p: { xs: 2, md: 3 } } ``. No shadow, no hover transform. Clickable: `component={Link}`, `"&:hover": { borderColor: LINE.strong }`, `"&:active": { background: SURFACE.raisedTertiary }`, `` transition: `border-color ${MOTION.hover}, background-color ${MOTION.hover}` ``. Content inside groups with `Stack spacing={2}` and `<Divider />`, never a second card; a nested block is `SURFACE.raisedSecondary` with `RADIUS.control`.
3. **Primary button.** `<Button variant="contained">` (theme: ember fill, `TEXT.onAccent`, pill, `minHeight` 40, no shadow, press scale, hover `ACCENT.hover`). One per screen. `size="large"` (48px) for a hero, the home `StartButton` (64px, `3px` white focus ring) is the only bigger one. For a delayed action show `CircularProgress size={16}` inside it with the label "Saving".
4. **Secondary button.** `<Button variant="outlined">` (hairline `LINE.strong`, hover `rgba(255,255,255,0.06)`). **Tertiary:** `<Button variant="text">`. A quiet tinted action (Donate): `{ background: ACCENT.tint, color: ACCENT.hover, "&:hover": { background: "rgba(249,115,22,0.22)" } }`, still a pill because it is a button.
5. **Chip or tag.** `<Chip size="small">` or `` { background: SURFACE.raisedSecondary, color: TEXT.primary, borderRadius: `${RADIUS.small}px`, px: 1, py: 0.25, fontSize: TYPE.caption.fontSize, fontWeight: 500, minHeight: 24 } ``. Category: `accent.soft` background, `accent.bright` text. Selected (a pressable filter chip): `ACCENT.tint`, `border: 1px solid ACCENT.border`, `color: ACCENT.hover`, pill radius allowed because it is pressed.
6. **Dialog.** `<Dialog>` with no paper overrides (theme: `SURFACE.overlay`, `RADIUS.sheet`, hairline, `SHADOW.modal`, scrim, 200ms fade with scale 0.96). `<DialogTitle>` is `TYPE.h4`; Cancel on the left, the one primary on the right; `fullScreen` below `sm`. `AuthDialog`, `LoadGameDialog`, `CoachShareDialog`, `OnboardingHelp`, `WelcomeTour`, `FlagModal` all use it; `ConsentBanner`, `OnboardingNudge` and `WelcomeTour` mount inside Layout's themed shell, not `_app.tsx`.
7. **Drawer or sheet.** The drawer material from section 4, `MOTION.springSheet`, same path in and out, a grabber on a bottom sheet, swipe to dismiss on the phone, `MATERIAL.scrim`. Opaque `SURFACE.overlay` if it ever opens over another sheet.
8. **Menu, popover, tooltip, snackbar.** From the theme, untouched: `SURFACE.overlay`, hairline, `SHADOW.floating`, `RADIUS.control` (menu) or `RADIUS.small` (tooltip), rows `RADIUS.small` with hover 6% and selected 10%. `transformOrigin` at the trigger.
9. **Nav bar.** `NavPill` as shipped: sticky 16px from the top, `RADIUS.card`, the nav material, hairline, links in `TEXT.secondary` with the active item `TEXT.primary` weight 600 on `rgba(255,255,255,0.10)` and `aria-current="page"`, no indicator following hover, no gradient, no shadow. Sign in is a contained pill; Donate the tinted pill. Its height does not change (five routes carry a CLS budget).
10. **List row.** `` { display: "flex", alignItems: "center", gap: 1.5, px: 1.5, py: 1.25, minHeight: 44, borderRadius: `${RADIUS.small}px`, "&:hover": { background: "rgba(255,255,255,0.06)" }, "&:active": { background: SURFACE.raisedTertiary } } ``; selected `rgba(255,255,255,0.10)`, `TEXT.primary`, weight 600; rows separated by `<Divider />` or 4px, never by a card each.
11. **Input.** `<TextField>` (theme: 6% white fill, hairline, `LINE.strong` on hover, `ACCENT.main` 1px when focused, `RADIUS.control`). Label above as `TYPE.label`; helper and error text below in `TYPE.caption`, error in `STATUS.error`, validated inline on blur. No duplicated dark-glass input sx.
12. **Status banner.** `<Alert severity="info">` from the theme (`STATUS.infoTint`, hairline, `RADIUS.control`, `TEXT.primary` text, the colour on the icon). Custom: the same four values. One sentence of what happened and one of what to do; an action as a text button on the right.
13. **Empty state.** Masti at the size the surface already uses (never larger, never over a board in play), one sentence in his voice, one action. A sign-in ask spreads `SIGN_IN_PROPS`. Mood from the existing reducers.
14. **Loading.** `<Loader size={..} showLabel />` (ring, `TEXT.secondary`, sentence-case caption) for a region; `CircularProgress size={16}` beside a status line for an activity; `<Skeleton />` (theme: static 6% block) with the final height for content that will replace it.
15. **Segmented control and tabs.** `<Tabs>` (theme: 2px indicator, 44px tabs, sentence case) or a `ToggleButtonGroup` on `SURFACE.raisedSecondary` with the selected segment `rgba(255,255,255,0.10)` and `TEXT.primary`; a `layoutId` indicator may slide 200ms between selected items only.
16. **Masti speech bubble (`MastiSays`).** `SURFACE.raisedSecondary`, hairline, `RADIUS.card` with one square corner toward him, `TYPE.body` text, no blur, no shadow, no tone tint; the hero's white bubble is the one exception.

## 11. Do not touch

- `src/components/ads/**` in full (the advertisers' creatives, `PartnerBanner`, `PartnerSlot*`, `partners.ts`, `previewOptions.ts`) and the partner-preview hooks: every `{...SIGN_IN_PROPS}`, `{...VIEWPORT_LOCK_PROPS}` and `data-cm-*` spread stays on the element it is on (NavPill, AppDrawer, HeroMasti, ScoutLanding, AnalysisImpl, QuizResult, PuzzleSessionRail, InlinePuzzleCoach, `pages/puzzles.tsx`, `profile.tsx`); `src/pages/_document.tsx` lines 42 to 43; `PartnerSlotPages` placement in NavPill and `layout/index.tsx`; `src/pages/partners/**` except the live page's snapshot panel. Adding `SIGN_IN_PROPS` to a sign-in ask that lacks it (`PuzzleSignInGate`) is allowed.
- Chess, engine and board logic everywhere: `src/lib/**`, `chess.js` calls, `ChessgroundBoard.tsx` (brushes, outer div), `ChessgroundBoardPlaceholder.tsx`, `boardTheme.ts`, `tacticDiagrams.ts`, `diagramTokens.ts`, the drawable arrow palette, `PuzzleBoardSurface` keyboard and drop handling, `LichessLiveBoard` move logic and square colours, `TwinBotGame`, the opening and course trainers' `onPieceDrop`, `CLASSIFICATION_COLORS` and glyphs, eval-bar maths, `coachMoveRefs.ts`, `playerSide.ts`, `generateSuggestions.ts`, `MasterGamesPanel` candidate derivation, the board CSS block in `AnalysisImpl.tsx` (around lines 2395 to 2425), `DEMO_SPEED_MS`, `FlashOverlay`'s key-remount contract, `usePuzzleBoardState`, `src/sections/analysis/states.ts`.
- Viewport-locked geometry: `AnalysisImpl.tsx` and `src/pages/puzzles.tsx` keep every height, width, grid template, overflow, padding and position (`LOCK_MIN_HEIGHT_PX`, `UNLOCKED_BOARD_WIDTH`, `BOARD_MIN_PX`, the grip, the merged bottom row); `PuzzleToolbar` and `PuzzleCoachPanel`'s 34px header are part of the same pixel budget; `landingPuzzle.tsx` `BOARD_FRAME_SX`/`BOARD_CAPTION_SX`; `[rating].tsx` single `CARD_SX`; `repetit-training`'s unconditional stats card with its placeholder dashes; `LichessLivePlay` keyed phase roots and `minHeight 420`; `GAMES_TABLE_MIN_HEIGHT`/`MAX_WIDTH`; `learn.tsx` row heights 56 vs 46; `SlotChooser`'s 3px left edge.
- Masti: every `Masti`, `MastiAvatar`, `MastiSays` mount, its size, mood, `loops`, `decorative`, `priority`, `replayKey`; the reducers in `src/components/masti/mood.ts`; `manifest.ts`, `Masti.tsx`, `useMastiMotion.ts`, `useStickyMood.ts`; `public/masti/*`; his bubble copy's voice; his test ids.
- Every `data-testid`, `aria-label`, `role`, `aria-current`, `tabIndex`, keyboard handler and focus style. Copy pinned by tests (the lists in each audit: "I agree", "Maybe later", "Quick tour", "Close tour", "Open menu", "Account menu", "Sign in", "Let's go", "Hi!", "Backed by chess masters", the AgeGate labels, the tour headings, "Analyse" on the puzzle tool, "Reference", "Eliminate", "Submit move", "Solved", "Masters", "Engine analysis", "Exploring", the course trainer strings, the plan and performance headings, the terms and privacy sentences, the chess-basics headings and dates).
- Auth, data and server code co-located with UI: `AuthDialog` sign-up, age gate, handle and focus trap; `ProfileDialog` save; quiz persistence and config; `ConsentBanner` consent, `--cm-consent-h` and z-index; `OAuthErrorSnackbar`; `ChatHistoryList` Firestore calls; `ErrorBoundary`; `EmployeeChrome` `data-viewer`; `Lc0DownloadBanner` status fetch; `getServerSideProps` everywhere; `src/pages/api/**`; `src/app/api/**`; `actions.ts`; JSON-LD `@id` graphs, `sitemap.ts`, `robots.ts`; OG image routes' runtime, size and mini-board colours.
- Data colours that encode meaning: `strengthColor`/`tellColor`, `BAND_COLORS`, W/D/L bars, `RESULT_TONE`, `PATTERN_COLOR`, intern `STATUS_STYLES`, recharts series colours.
- `src/pages/preview/**` redirect stubs, `Chesskit/`, `src/theme/tokens.ts` `MATERIAL_FALLBACK_SX` queries (extend, do not remove), `src/components/ui/Loader.tsx` and `FadeIn.tsx` (reuse, do not restyle), the already-flat `src/sections/loadGame/**` (an optional `glass*` to `dialog*` rename with its test is the only change).
- Tests: update an assertion that pinned the old look in the same PR; never weaken a behavioural one. Before renaming any label, grep `tests/e2e` and `src/**/__tests__`.
- Uncommitted work in flight: `git status` first and read a modified file before editing it; six `src/sections/practice` files were rewritten concurrently.

## 12. Verification

Run from the repo root. Each grep must print nothing, or only the named allowlist.

```
# decoration and glass (allowlist: NavPill.tsx, AppDrawer.tsx, ConsentBanner.tsx, src/theme/tokens.ts)
rg -n "backdropFilter|WebkitBackdropFilter|saturate\(1[0-9]{2}%\)" src --glob '!**/__tests__/**' --glob '!src/components/ads/**'
# gradients, glow, gradient text (allowlist: maskImage fades, boardTheme.ts, the board CSS block in AnalysisImpl.tsx)
rg -n "linear-gradient|radial-gradient|conic-gradient|WebkitBackgroundClip|backgroundClip|inset 0 1px 0|0 0 [0-9]+px|\.glow\b|filter: ?\"blur" src --glob '!**/__tests__/**' --glob '!src/components/ads/**' --glob '!src/lib/**'
rg -n "boxShadow[^\n]*rgba\((249|34|239|168|251|255), ?[0-9]+, ?[0-9]+" src --glob '!src/components/ads/**'
# deleted components and motion (allowlist: none)
rg -n "GradientBackdrop|BorderBeam|Spotlight|MarqueeStrip|BentoCard|NumberTicker|useInView|whileHover|repeat: ?Infinity|revealDelay|animationDelay|transitionDelay|useMotionValue|transition: ?\"all" src --glob '!**/__tests__/**' --glob '!src/components/masti/**'
rg -n "@keyframes (pulse|shimmer|cmGlow|pulse-badge|puzzleCoachCursor|cmEvalBarPulse)|infinite" src --glob '!src/components/masti/**' --glob '!src/theme/**'
# type: tracking, case, fonts and sizes live in the theme (allowlist: src/theme/**, launchTheme.ts)
rg -n "letterSpacing:|fontFamily:|textTransform: ?\"uppercase\"|variant=\"overline\"" src --glob '!src/theme/**' --glob '!**/__tests__/**'
rg -n "fontSize: ?\"?0\.(5[0-9]|6[0-9]|7[0-4])rem|fontSize: ?(10|11)\b" src
# colour: jewel chrome, purple, legacy palettes, page-local themes and scrollbars (allowlist: accents.ts; themeAccent on a tag chip)
rg -n "surfaceAccent|SURFACE_ACCENTS|#A855F7|#7B61FF|123, ?97, ?255|#FF6B35|#FF8C42|255, ?107, ?53|#0b1120|#0f172a|#1e293b|#1a2332|#111c38|createTheme\(|::-webkit-scrollbar-thumb" src --glob '!src/theme/**' --glob '!src/components/landing/launchTheme.ts'
rg -n "rgba\(249, ?115, ?22, ?0\.(0[5-9]|1[0-9]|2[0-9])\)" src   # only ACCENT.tint via the token, never a literal
# icons and focus
rg -n "Sparkles|AutoAwesome" src
rg -n "outline: ?\"?none" src   # every hit has an &:focus-visible sibling
# copy (allowlist: the three technology pages' body prose under src/app; the two test-pinned em dashes)
rg -n "AI-powered|Insights?\b|Unlock|journey|\bSmart\b|Master your|Powerful|Level up|Elevate|Seamless|Supercharge|Unleash|cutting-edge|Experience the|Dive in|engine-grounded|hallucination validator|Neo4j" src/pages src/components src/sections src/app --glob '!**/__tests__/**'
rg -n $'\u2014' src/pages src/components src/sections src/app --glob '!**/__tests__/**' -g '*.tsx'   # em dashes
# the gates
npx tsc --noEmit
npx vitest run                       # ~4.5 min; the home, masti, OpeningLineCard, PrepLinesPanel and loadGameDialog tests pin the look
npm run build
npx playwright test --project=local-desktop-light
npx playwright test --project=local-mobile-light   # carries the CLS budgets
```

CLS budgets (`tests/e2e/local/layout-stability.spec.ts`, throttled phone, `local-mobile-light` only): `/analysis`, `/repetit-training`, `/puzzles/1200`, `/play`, `/database` each below 0.1. Removing decoration should lower them; a rise means a swap changed size or the nav moved. For attribution run `node scripts/perf/cls-probe.mjs <base url>`.

Screenshots to review against sections 3 to 8, at 1280x720 and 390x664, light system preference: `/`, `/plan`, `/play`, `/practice`, `/puzzles`, `/puzzles/sessions`, `/analysis` with a game loaded and the coach open, `/learn`, `/courses`, `/scout`, `/profile`, `/repetit-training`, the auth dialog, the load-game dialog, the attitude menu, the drawer on the phone, the consent banner, `/not-found`, `/faq`, `/how-it-works`, `/internship`. Look for: any blur or gradient, any colour that is not a token, any uppercase label, any text below 13px that a user acts on, any element that moved on hover, any shadow on an in-flow card, a second translucent layer, Masti over a board in play.

Before shipping copy changes to the coach, run `scripts/synthetic-tester/` by hand (it is not in CI).
