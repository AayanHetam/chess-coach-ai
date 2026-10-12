# Chess Masti design rules

How the site looks and moves, and the rules an edit has to follow. Written for whoever changes a screen: a person or an agent. Sources: Emil Kowalski's apple-design skill (Apple's WWDC design talks translated for the web), Apple's own web code (the DocC renderer and swift.org), apple.com and the Human Interface Guidelines. Tokens live in `src/theme/tokens.ts`; the theme that applies them is `src/theme/chessMasti.ts`.

## 1. Why

The site was built in an "Obsidian-Glass" style: blurred gradient orbs behind every page, frosted-glass cards, coloured glow shadows, gradient headlines, rotating border beams, cursor spotlights, uppercase letter-spaced labels, scroll-reveal choreography, marquees, hover lifts, sparkle icons and per-surface jewel colours. That texture is what a page looks like when nobody decided anything, and every one of those devices is now a tell. The new discipline is Apple's: purpose, restraint and craft. The site stays dark. Dark is not the problem; decoration is.

## 2. The eight principles, applied

1. **Purpose.** Every element earns its place. Decoration that serves no human need (orbs, beams, sparkles, marquees) is removed, not restyled.
2. **Agency.** People stay in control: undo over confirmation, confirmation only for destructive, irreversible actions, never a locked-out transition.
3. **Responsibility.** Ask for a sign-in or a permission at the moment it is needed, say what it is for, and never dress a sign-in ask as something else.
4. **Familiarity.** Things that look the same behave the same and live in the same place: one button system, one card, one nav, close always where it was last time.
5. **Flexibility.** Layouts scale with the user's text size (rem and em), work on a phone and a desktop, honour reduced motion, reduced transparency and more contrast.
6. **Simplicity, not minimalism.** Plain language, fewer steps, hierarchy by order, spacing and contrast. The common path first, advanced options one level deeper.
7. **Craft.** Nothing is random. Every spacing, size, colour and timing is a token or a deliberate value you can defend.
8. **Delight.** The result of the other seven. Masti's warmth is the delight; confetti, glow and sparkle are not.

Tactical rules that follow: feedback comes as status, completion, warning or error, inline and at the moment it applies; every screen answers where am I, where can I go, what is here, how do I get out; controls sit next to what they affect; labels are specific ("Puzzles", "Analyze"), not vague.

## 3. Tokens

All values are in `src/theme/tokens.ts`. Import them; do not retype them.

### Surfaces (dark, opaque)

| Token | Value | Use |
| --- | --- | --- |
| `SURFACE.page` | `#000000` | The page. |
| `SURFACE.raised` | `#1C1C1E` | A card, a panel, a list. |
| `SURFACE.raisedSecondary` | `#2C2C2E` | A control or row on a raised surface. |
| `SURFACE.raisedTertiary` | `#3A3A3C` | A hovered row, a tooltip. |
| `SURFACE.overlay` | `#1C1C1E` | Menus, dialogs, the drawer at rest. |
| `LINE.hairline` | `rgba(255,255,255,0.10)` | Every border on a dark surface. |
| `LINE.separator` | `rgba(84,84,88,0.65)` | Dividers inside a list. |
| `LINE.strong` | `rgba(255,255,255,0.18)` | An outlined control. |

Hover on a surface: `rgba(255,255,255,0.06)`. Selected: `rgba(255,255,255,0.10)`.

### Text

| Token | Value |
| --- | --- |
| `TEXT.primary` | `#F5F5F7` |
| `TEXT.secondary` | `rgba(235,235,245,0.60)` |
| `TEXT.tertiary` | `rgba(235,235,245,0.30)` |
| `TEXT.onAccent` | `#0A0A0A` |

### Accent and status

One accent, the brand's ember: `ACCENT.main #F97316` for the primary action and links, `ACCENT.hover #FB923C`, `ACCENT.active #EA580C`, `ACCENT.tint rgba(249,115,22,0.14)` for a selected state or a tag, `ACCENT.border rgba(249,115,22,0.45)` for a selected control's hairline. Never as a glow, a gradient or the fill of a large area.

Status: `STATUS.success #30D158`, `STATUS.warning #FFD60A`, `STATUS.error #FF453A`, `STATUS.info #0A84FF`, each with a `*Tint` at 14% for banners and chips.

Category colours (`src/components/ui/accents.ts`: ember, gold, jade, cyan, violet, rose) exist so that puzzle themes and course areas can be told apart. They are used as `accent.soft` background with `accent.bright` text on a tag or chip, or as an icon colour. Never as a border glow, a gradient, a large fill, or on chrome (the nav, the drawer, dialogs). `accent.glow` is `"none"` and must not be used. Chess board colours are not part of this system and are untouched.

### Type

The platform font first: `FONT_SANS` is `-apple-system, BlinkMacSystemFont, system-ui, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Helvetica, Arial, sans-serif`. No webfont is downloaded. `FONT_MONO` for FEN, PGN and code. `SERIF_DISPLAY` (in `src/theme/fonts.ts`) may stay where it already is the content's own voice, such as the puzzle prompt.

| Role | Size | Weight | Line height | Tracking |
| --- | --- | --- | --- | --- |
| `TYPE.display` | 56px | 700 | 1.07 | -0.025em |
| `TYPE.h1` | 40px | 700 | 1.10 | -0.02em |
| `TYPE.h2` | 28px | 600 | 1.15 | -0.015em |
| `TYPE.h3` | 22px | 600 | 1.20 | -0.01em |
| `TYPE.h4` | 19px | 600 | 1.25 | -0.005em |
| `TYPE.h5` | 17px | 600 | 1.30 | 0 |
| `TYPE.body` | 17px | 400 | 1.50 | 0 |
| `TYPE.bodySmall` | 15px | 400 | 1.45 | 0 |
| `TYPE.caption` | 13px | 400 | 1.40 | +0.005em |
| `TYPE.label` | 13px | 600 | 1.30 | +0.005em |

Tracking tightens as size grows and sits near zero at body size; leading loosens as size shrinks. Hierarchy comes from weight, size and leading together, never from uppercase or colour alone. Numbers that align in a column use `fontVariantNumeric: "tabular-nums"`.

### Radius, borders, shadows, spacing

`RADIUS.small 8` (chips, tags, menu rows), `RADIUS.control 10` (inputs, icon buttons), `RADIUS.card 16` (cards, the nav), `RADIUS.sheet 20` (dialogs, sheets), `RADIUS.pill 980` (pill buttons and chips only, never a container).

Borders are 1px hairlines. Nothing on the page casts a shadow: a card is a surface, not an object. Only floating things do: `SHADOW.floating` (menus, tooltips, popovers, banners) and `SHADOW.modal` (dialogs, sheets). Both are neutral black.

Spacing is MUI's 8px unit. Section rhythm on a page: 48 to 96px between sections, 16 to 24px inside a card, 8px between related controls.

## 4. Materials

Translucency belongs to floating chrome that content scrolls under, and nowhere else: the nav bar, the drawer sheet, dialogs, menus, the consent banner. Use `MATERIAL.background rgba(28,28,30,0.72)` with `MATERIAL.backdropFilter saturate(180%) blur(20px)` and a `MATERIAL.border` hairline, and always spread `MATERIAL_FALLBACK_SX`, which makes the surface solid under `prefers-reduced-transparency: reduce` and `prefers-contrast: more`. A structural sheet (the drawer) is a heavier material (`rgba(28,28,30,0.9)`, `blur(24px)`). Never stack one translucent surface on another. Content cards, panels, rows, chips, inputs and banners inside the page are opaque `SURFACE.*`. The modal scrim is `MATERIAL.scrim rgba(0,0,0,0.5)` with no blur.

## 5. Motion

- Feedback fires on pointer-down: every pressable thing scales to `MOTION.pressScale` (0.97) over `MOTION.press` (100ms). The theme does this for MUI ButtonBase; custom buttons add `"&:active": { transform: MOTION.pressScale }`.
- Hover changes colour or background over `MOTION.hover` (160ms ease-out). Hover never lifts (`translateY`) or scales up.
- A dialog, menu or popover arrives with a 160 to 200ms cross-fade and a small scale from its origin (`transform-origin` at the trigger), and leaves along the same path. A sheet or drawer moves on a critically damped spring, `MOTION.springSheet` (bounce 0, duration 0.4), entering and exiting the same way. Bounce (`MOTION.springFlick`) is for something the user flicked, never for something that just appeared.
- Delete outright: scroll reveals (`useInView` plus `initial`/`animate`), staggered entrance sequences, `whileHover` scale or lift, `repeat: Infinity` loops, marquees, rotating beams, cursor spotlights, count-up tickers, pulsing glows.
- Keep, as the only decorative motion: a new chat message fading in (`FadeIn`, opacity only, 180ms); Masti's own stills and, when a pack has them, his bounded animation bursts.
- `framer-motion` stays only where a gesture, a sheet, a `layoutId` indicator or an `AnimatePresence` exit is genuinely in use. A `motion.div` that only decorated becomes a plain `Box`.
- `prefers-reduced-motion: reduce` is honoured globally (the theme's baseline shortens every animation and transition to near zero); anything with its own JS-driven motion checks it too (Masti's `useMastiMotion`).

## 6. Typography rules

Sentence case everywhere: headings, buttons, labels, tabs. No uppercase tracked labels, no all-caps overlines, no eyebrow badges above headings; a small label above a group is `TYPE.label`. No letter-spacing of 0.08em or more anywhere. Headings use the theme variants (`h1` to `h6`) or `TYPE.*`; body copy is `body1` (17px) or `body2` (15px); fine print is `caption` (13px), never smaller than 12px. Weight makes emphasis; colour marks status, not emphasis.

## 7. Colour rules

One accent. Text is `TEXT.primary` or `TEXT.secondary`; `TEXT.tertiary` only for the least important line. No gradients anywhere: not as a fill, not as text, not as a border. No glow: no `boxShadow` with a colour, no `filter: blur()`. The primary action on a screen is the only thing that is solid ember; everything else that is clickable is outlined, text, or a tinted chip. Status colours are for status (a success banner, an error line, a warning), never for decoration. Icons are `lucide-react` at 16 to 20px, `strokeWidth` 1.75, in `TEXT.secondary` or the accent, standing on their own, never inside a tinted circle or square. The board, the pieces and the evaluation bar keep their own colours.

## 8. Copy rules

Plain language, sentence case, specific labels. Lead with what the user gets, not with the technology. No exclamation marks, except in Masti's own speech bubbles where one is in character. No emoji in chrome, labels or headings. No em dashes in UI strings: use a comma, a period or a colon. No "NEW" badges, no "AI-powered". Masti's bubbles keep his voice; the chrome around them is quiet.

| Jargon | Plain |
| --- | --- |
| Engine-grounded, Stockfish-grounded, engine-first | Checked against the engine (or drop it) |
| Engine-validated, hallucination validator, validated claims | Every claim is checked |
| Stockfish 17 (as a selling point) | The engine |
| Neo4j graph, 100,000+ position graph | Puzzles chosen for you |
| Maia-2 humanlike opponent | A human-like opponent |
| AI-powered, powered by AI, LLM | (drop) |
| Supercharge, unlock, elevate, level up | Improve, get better at |
| Seamless, effortless, world-class, cutting-edge, blazing | (drop) |
| Obsidian, glass, ember (in UI copy) | (drop) |
| Analyze with Chess Masti (button in a mock) | Analyze |

## 9. Tell to fix

| Tell (grep) | Fix |
| --- | --- |
| `backdropFilter`, `WebkitBackdropFilter` on content | Remove; the surface becomes `SURFACE.raised` with a hairline. Keep only on floating chrome with `MATERIAL_FALLBACK_SX`. |
| `rgba(20,22,28,...)`, `rgba(12,14,20,...)` fills | `SURFACE.raised` or `SURFACE.raisedSecondary`. |
| `inset 0 1px 0 rgba(255,255,255,...)` | Remove. |
| `boxShadow` with any colour, `0 0 Npx` glows | Remove; floating things use `SHADOW.floating` or `SHADOW.modal`. |
| `linear-gradient`, `radial-gradient`, `conic-gradient` | A solid: `ACCENT.main` for the primary action, `SURFACE.*` for surfaces, `ACCENT.tint` for a selected state. Decorative orbs are deleted. |
| `WebkitBackgroundClip: "text"` | Plain `TEXT.primary` or the accent. |
| `filter: "blur(...)"` | Remove the element if it was a glow; otherwise remove the filter. |
| `textTransform: "uppercase"`, `variant="overline"`, `letterSpacing >= 0.08em` | `TYPE.label`, sentence case. |
| `Sparkles` | Remove the icon. |
| Icon in a tinted circle or rounded square | The plain icon, 18 to 20px. |
| `borderRadius: "999px"` on a container | `RADIUS.card` or `RADIUS.control`. |
| `useInView` + `initial`/`animate`, `delay:` staggers, `whileHover`, `repeat: Infinity` | Delete; static content, hover colour only, press scale. |
| `surfaceAccent` / `themeAccent` on chrome, `accent.glow`, accent gradients | Neutral chrome; tags may keep `accent.soft` + `accent.bright`. |
| `NumberTicker` | The formatted number. |
| Inline `slotProps.paper` re-adding blur or gradients to Dialog, Menu, Popover, Tooltip | Remove; the theme styles them. |
| MUI `elevation` above 0 on a page card | `elevation={0}` with a hairline (`variant="outlined"`). |

## 10. Component recipes (MUI sx)

- **Page frame:** the body colour is the page; a content column `maxWidth` 1120 to 1400, `px: { xs: 2, md: 4 }`. No backdrop component.
- **Card:** `{ background: SURFACE.raised, border: \`1px solid ${LINE.hairline}\`, borderRadius: \`${RADIUS.card}px\`, p: { xs: 2.5, md: 3 } }`. No shadow, no hover transform. A clickable card changes its border to `LINE.strong` on hover and scales to 0.98 on press.
- **Primary button:** MUI `<Button variant="contained">` (pill, ember, no shadow, press scale from the theme). Custom: `{ background: ACCENT.main, color: TEXT.onAccent, borderRadius: \`${RADIUS.pill}px\`, minHeight: 40, px: 2.25, fontWeight: 600, "&:hover": { background: ACCENT.hover }, "&:active": { transform: MOTION.pressScale } }`.
- **Secondary button:** `<Button variant="outlined">` (hairline `LINE.strong`, hover fill 6% white). **Tertiary:** `<Button variant="text">`.
- **Quiet tinted action** (Donate, a secondary call in a dialog): `{ background: ACCENT.tint, color: ACCENT.hover, borderRadius: pill, "&:hover": { background: "rgba(249,115,22,0.22)" } }`.
- **Chip or tag:** `{ background: SURFACE.raisedSecondary (or accent.soft for a category), color: TEXT.primary (or accent.bright), borderRadius: \`${RADIUS.small}px\`, px: 1, py: 0.25, fontSize: TYPE.caption.fontSize, fontWeight: 500 }`. Selected: `ACCENT.tint` with `ACCENT.border`.
- **Dialog:** MUI `<Dialog>`; the theme gives it `SURFACE.overlay`, `RADIUS.sheet`, a hairline and `SHADOW.modal`. Title is `TYPE.h4`. No inline paper overrides.
- **Drawer or sheet:** the material at `rgba(28,28,30,0.9)` with `blur(24px)`, `SHADOW.modal`, `MOTION.springSheet`, same path in and out, scrim `MATERIAL.scrim`.
- **Menu, popover, tooltip:** from the theme; do not restyle.
- **Nav bar:** `NavPill` as is.
- **List row:** `{ px: 1.5, py: 1.1, borderRadius: \`${RADIUS.small}px\`, "&:hover": { background: "rgba(255,255,255,0.06)" } }`; selected `rgba(255,255,255,0.10)` with `TEXT.primary`; an optional 6px `TEXT.primary` dot for the current item.
- **Input:** MUI `TextField` (the theme: 6% white fill, hairline, accent border when focused).
- **Status banner:** `{ background: STATUS.infoTint (or the matching tint), border: \`1px solid ${LINE.hairline}\`, borderRadius: \`${RADIUS.control}px\`, p: 2 }` with the status colour on the icon only.
- **Empty state:** Masti at the size the surface already uses, one sentence, one action. His rules in `CLAUDE.md` hold.
- **Loading:** `<Loader />` (thin ring, sentence-case caption) or MUI `CircularProgress` with `size={20}`.

## 11. Do not touch

- `src/components/ads/**`: the advertisers' own creatives and the partner banner. The partner-preview attribute spreads (`SIGN_IN_PROPS`, `VIEWPORT_LOCK_PROPS`, `data-cm-*`) stay exactly where they are.
- Chess, engine and board logic; board and piece colours; the evaluation bar's colours; `src/lib/**`; `Chesskit/`.
- The geometry of the viewport-locked layouts: `src/components/preview-analysis/AnalysisImpl.tsx` and `src/pages/puzzles.tsx` keep their heights, widths, grid templates, overflow and positions (a CLS budget measures them).
- Masti: his placement, size, moods and the mood reducers. The copy in his bubbles keeps his voice.
- Every `data-testid`, `aria-*`, `role`, keyboard handler and focus style.
- Tests: update an assertion that pinned the old look; never weaken a behavioural one.

## 12. Verification

```
# tells that must be gone from src (allowlist: MATERIAL_* on floating chrome, the drawer, the consent banner)
rg -n "linear-gradient|radial-gradient|conic-gradient|WebkitBackgroundClip|filter: \"blur\(|textTransform: \"uppercase\"|whileHover|repeat: Infinity|useInView|Sparkles|\.glow" src --glob '!**/__tests__/**' --glob '!src/components/ads/**' --glob '!src/lib/**'
rg -n "boxShadow[^\n]*rgba\(249,115,22|0 0 [0-9]+px" src --glob '!src/components/ads/**'
rg -n "backdropFilter" src --glob '!src/components/ads/**'   # only NavPill, AppDrawer, ConsentBanner, MATERIAL tokens
npx tsc --noEmit
npx vitest run
npm run build
npx playwright test --project=local-desktop-light
npx playwright test --project=local-mobile-light   # includes the CLS budgets
```

Then look: screenshots of `/`, `/plan`, `/play`, `/practice`, `/puzzles`, `/analysis`, `/learn`, `/scout`, `/courses`, `/profile`, a dialog, the drawer on a phone, and three content pages, judged against sections 3 to 8.
