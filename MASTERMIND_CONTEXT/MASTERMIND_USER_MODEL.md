# MASTERMIND_USER_MODEL.md

## SUMMARY

Every persistent user attribute the Mastermind agent can read, with field-by-field schemas tied to source files. Three storage tiers gate what the agent can do without help: **Firestore** is server-truth, accessible directly from server-side route handlers via Firebase Admin SDK; **localStorage** is client-only — the agent cannot read it server-side and must request the data through the user's browser session; **IndexedDB** holds a single live layer (a client-side cache of cloud games at [src/hooks/useGameDatabase.ts](../src/hooks/useGameDatabase.ts)), which is not currently a primary read target since the same data exists in Firestore. CLAUDE.md's claim that IndexedDB holds puzzle progress and SRS state is inaccurate for the SRS layer specifically — flagged below per the green-light Q3 instruction. The user-model fields cluster into seven shapes: UserProfile + CoachingPrefs (Firestore), CloudGame (Firestore), ChatRecord + ChatMessageRecord (Firestore), WeaknessProfile (localStorage, client-only), DrillProgress (localStorage via jotai), RepetitTraining state (localStorage), and OpeningRepertoire (built-in static module + user-imported runtime; persistence layer for user-imported repertoires not identified). Each section below gives field-level type, source-line citation, tier, nullability, and an example. The Reading Patterns section maps each tier to the API endpoints (or client-upload requirement) the agent uses.

---

## Storage tiers

The agent must reason about **where** data lives before deciding how to read it.

### Tier F — Firestore (server-truth)

- **Accessed via**: server-side Firebase Admin SDK in route handlers under [src/app/api/](../src/app/api/), proxied through endpoints like `/api/auth/me`, `/api/users/me`, `/api/games`, `/api/chats`. Browser code never contacts `firestore.googleapis.com` directly (post-school-WiFi migration; see [CLAUDE.md](../CLAUDE.md) "Auth model").
- **Agent reads**: directly via the same proxy endpoints, with the user's session cookie (`cm_session`) attached.
- **Carries**: account identity, preferences, saved games, chat history.

### Tier L — localStorage (client-only)

- **Accessed via**: `window.localStorage.getItem(key)` in client modules. Server has no view of these keys.
- **Agent reads**: only by **asking the client to upload** the relevant blob in a request payload (e.g. as part of a tool-call or as initial-context priming). The agent cannot fetch this server-side.
- **Carries**: weakness profile, SRS drill progress, Repetit Training history, miscellaneous client preferences.

### Tier I — IndexedDB (client cache; one live layer)

- **Accessed via**: the `idb` library at [src/hooks/useGameDatabase.ts:5,17-22,42-47](../src/hooks/useGameDatabase.ts#L5-L47). Opens database `"games"`, version `1`, with object store `"games"` keyed by `id` (auto-incrementing).
- **What it stores**: a local cache of cloud games (`Game & { firestoreId?: string }`), populated from `getCloudGames()` in [firestoreGames.ts:28-33](../src/lib/firestoreGames.ts#L28-L33) on login. It mirrors Firestore — not a separate truth source.
- **Agent reads**: **not a primary read target**. Same data is available authoritatively from Firestore via `/api/games`. The IndexedDB layer matters only for offline behavior and as a sync target.

### CLAUDE.md inaccuracy flag (per green-light Q3)

> CLAUDE.md states "IndexedDB (via `idb`) — client-side puzzle progress, spaced-repetition state. See [spacedRepetition.ts](../src/lib/spacedRepetition.ts), [repetitTraining.ts](../src/lib/repetitTraining.ts)."
>
> This appears inaccurate for SRS or refers to a layer not yet identified. Pending CLAUDE.md correction in a separate PR.

**Refinement (not part of the verbatim flag):** the `idb` library *is* used in the codebase, but only at [src/hooks/useGameDatabase.ts:5](../src/hooks/useGameDatabase.ts#L5) for the `"games"` cache — not for SRS or puzzle progress. SRS lives in localStorage via jotai's `atomWithStorage` (see DrillProgress section below); Repetit Training also localStorage; weakness profile also localStorage. CLAUDE.md's pointer to `spacedRepetition.ts` and `repetitTraining.ts` as IndexedDB-backed is the part that does not match the code. Documenting here so the agent does not look for IndexedDB-backed SRS state that isn't there. **Do not edit CLAUDE.md from this PR.**

---

## UserProfile — Firestore (`users/{uid}`)

Source: [firestoreUsers.ts:10-44](../src/lib/firestoreUsers.ts#L10-L44). Tier **F** (Firestore). Read via `getUserProfile()` at [firestoreUsers.ts:54-60](../src/lib/firestoreUsers.ts#L54-L60), which fetches from `/api/auth/me`. Updated via `updateUserProfile()` at [firestoreUsers.ts:72-84](../src/lib/firestoreUsers.ts#L72-L84) → PATCH `/api/users/me`.

| Field | Type | Source line | Tier | Nullable | Example |
|---|---|---|---|---|---|
| `uid` | `string` | [firestoreUsers.ts:17](../src/lib/firestoreUsers.ts#L17) | F | no | `"abc123def456"` |
| `email` | `string` | [firestoreUsers.ts:18](../src/lib/firestoreUsers.ts#L18) | F | no | `"player@example.com"` |
| `displayName` | `string` | [firestoreUsers.ts:20](../src/lib/firestoreUsers.ts#L20) | F | yes | `"Aayan"` |
| `photoURL` | `string` | [firestoreUsers.ts:21](../src/lib/firestoreUsers.ts#L21) | F | yes | `"https://lh3.googleusercontent.com/..."` |
| `bio` | `string` | [firestoreUsers.ts:22](../src/lib/firestoreUsers.ts#L22) | F | yes | `"1500 rapid, learning the Caro-Kann"` |
| `chesscomUsername` | `string` | [firestoreUsers.ts:24](../src/lib/firestoreUsers.ts#L24) | F | yes | `"hikarunakamura"` |
| `lichessUsername` | `string` | [firestoreUsers.ts:25](../src/lib/firestoreUsers.ts#L25) | F | yes | `"DrNykterstein"` |
| `selfReportedRating` | `number` | [firestoreUsers.ts:26](../src/lib/firestoreUsers.ts#L26) | F | yes | `1500` |
| `primaryPlatform` | `"chesscom" \| "lichess"` | [firestoreUsers.ts:27](../src/lib/firestoreUsers.ts#L27) | F | yes | `"lichess"` |
| `rating` | `number` | [firestoreUsers.ts:28](../src/lib/firestoreUsers.ts#L28) | F | yes | `1620` (server-derived) |
| `coachTone` | `"friendly" \| "strict" \| "masti"` | [firestoreUsers.ts:10,30](../src/lib/firestoreUsers.ts#L10-L30) | F | yes | `"masti"` |
| `playingStyle` | `"tactical" \| "positional" \| "balanced"` | [firestoreUsers.ts:11,31](../src/lib/firestoreUsers.ts#L11-L31) | F | yes | `"tactical"` |
| `studyGoals` | `Array<"tactics" \| "endgames" \| "openings" \| "time-management">` | [firestoreUsers.ts:12,32](../src/lib/firestoreUsers.ts#L12-L32) | F | yes | `["tactics", "endgames"]` |
| `favoriteOpenings` | `string[]` | [firestoreUsers.ts:33](../src/lib/firestoreUsers.ts#L33) | F | yes | `["Caro-Kann", "King's Indian"]` |
| `boardTheme` | `"classic" \| "wood" \| "neon"` | [firestoreUsers.ts:13,35](../src/lib/firestoreUsers.ts#L13-L35) | F | yes | `"wood"` |
| `pieceSet` | `"default" \| "merida" \| "alpha"` | [firestoreUsers.ts:14,36](../src/lib/firestoreUsers.ts#L14-L36) | F | yes | `"merida"` |
| `createdAt` | `unknown` (Firestore Timestamp `{_seconds, _nanoseconds}`) | [firestoreUsers.ts:38](../src/lib/firestoreUsers.ts#L38) | F | yes | `{_seconds: 1714560000, _nanoseconds: 0}` |
| `updatedAt` | `unknown` (Firestore Timestamp) | [firestoreUsers.ts:39](../src/lib/firestoreUsers.ts#L39) | F | yes | same shape as above |

`UserProfileUpdates` ([firestoreUsers.ts:42-44](../src/lib/firestoreUsers.ts#L42-L44)) is `Partial<Omit<UserProfile, "uid" | "email" | "rating" | "createdAt" | "updatedAt" | "photoURL">>` — the agent must not write those omitted keys.

---

## CoachingPrefs — derived view used by the coach prompt

Source: [coachChatPrompt.ts:30-45](../src/lib/prompts/coachChatPrompt.ts#L30-L45). Tier **F** (composed from the `UserProfile` already in Firestore). Used by `getCoachChatSystemPrompt()` to build the system prompt.

| Field | Type | Source line | Tier | Nullable | Example |
|---|---|---|---|---|---|
| `coachTone` | `"friendly" \| "strict" \| "masti"` | [coachChatPrompt.ts:26,31](../src/lib/prompts/coachChatPrompt.ts#L26-L31) | F | yes | `"masti"` |
| `playingStyle` | `"tactical" \| "positional" \| "balanced"` | [coachChatPrompt.ts:27,32](../src/lib/prompts/coachChatPrompt.ts#L27-L32) | F | yes | `"balanced"` |
| `studyGoals` | `Array<StudyGoal>` (same enum as UserProfile) | [coachChatPrompt.ts:28,33](../src/lib/prompts/coachChatPrompt.ts#L28-L33) | F | yes | `["openings"]` |
| `favoriteOpenings` | `string[]` | [coachChatPrompt.ts:34](../src/lib/prompts/coachChatPrompt.ts#L34) | F | yes | `["Sicilian Najdorf"]` |

Surrounding shape `CoachChatPromptInput` ([coachChatPrompt.ts:37-45](../src/lib/prompts/coachChatPrompt.ts#L37-L45)) also threads in `personalityId`, `userRating`, `username`, `playerColorName`, `chesscomUsername`, `lichessUsername` — all derivable from `UserProfile` plus the route-level session context.

---

## CloudGame — Firestore (`games/{firestoreId}`)

Source: [firestoreGames.ts:13-18](../src/lib/firestoreGames.ts#L13-L18). Tier **F**. Read via `getCloudGames()` at [firestoreGames.ts:28-33](../src/lib/firestoreGames.ts#L28-L33) → GET `/api/games`. Underlying `Game` type is from `@/types/game`; the cloud envelope adds `firestoreId` and timestamps.

| Field | Type | Source line | Tier | Nullable | Example |
|---|---|---|---|---|---|
| `firestoreId` | `string` | [firestoreGames.ts:14](../src/lib/firestoreGames.ts#L14) | F | no | `"gJ3kLmN8oP1q"` |
| `(Game fields, omitted "id")` | `Omit<Game, "id">` | [firestoreGames.ts:13](../src/lib/firestoreGames.ts#L13) | F | per-field | PGN, eval, headers, side info — see `@/types/game` |
| `createdAt` | `unknown` (Firestore Timestamp) | [firestoreGames.ts:16](../src/lib/firestoreGames.ts#L16) | F | yes | `{_seconds: 1714560000, _nanoseconds: 0}` |
| `updatedAt` | `unknown` (Firestore Timestamp) | [firestoreGames.ts:17](../src/lib/firestoreGames.ts#L17) | F | yes | same shape |

Mutators: `addCloudGame()` (POST `/api/games`), `updateCloudGameEval()` (PATCH `/api/games/{firestoreId}`), `deleteCloudGame()` (DELETE `/api/games/{firestoreId}`) at [firestoreGames.ts:35-75](../src/lib/firestoreGames.ts#L35-L75).

A client-side IndexedDB cache (Tier I) at [useGameDatabase.ts:42-47](../src/hooks/useGameDatabase.ts#L42-L47) syncs from this on login; the agent should treat Firestore as authoritative.

---

## ChatRecord + ChatMessageRecord — Firestore (`chats/{chatId}` and `chats/{chatId}/messages/{messageId}`)

Source: [firestoreChats.ts:15-33](../src/lib/firestoreChats.ts#L15-L33). Tier **F**.

### `ChatRecord`

| Field | Type | Source line | Tier | Nullable | Example |
|---|---|---|---|---|---|
| `firestoreId` | `string` | [firestoreChats.ts:16](../src/lib/firestoreChats.ts#L16) | F | no | `"chat_abc123"` |
| `title` | `string` | [firestoreChats.ts:17](../src/lib/firestoreChats.ts#L17) | F | no | `"Sicilian Najdorf prep"` |
| `coachId` | `string \| null` | [firestoreChats.ts:18](../src/lib/firestoreChats.ts#L18) | F | yes | `"masti-coach"` or `null` |
| `gameRef` | `ChatGameRef \| null` | [firestoreChats.ts:19](../src/lib/firestoreChats.ts#L19) | F | yes | `{firestoreId: "...", pgn: "...", ...}` |
| `messageCount` | `number` | [firestoreChats.ts:20](../src/lib/firestoreChats.ts#L20) | F | no | `12` |
| `preview` | `string` | [firestoreChats.ts:21](../src/lib/firestoreChats.ts#L21) | F | no | `"Why did I lose this rook ending?"` |
| `titleSource` | `"manual" \| "llm" \| "pgn" \| "fallback"` | [firestoreChats.ts:22](../src/lib/firestoreChats.ts#L22) | F | no | `"llm"` |
| `createdAt` | `unknown` (Firestore Timestamp or ISO string or millis) | [firestoreChats.ts:23](../src/lib/firestoreChats.ts#L23) | F | yes | see `chatTimestampMs` at [firestoreChats.ts:121-138](../src/lib/firestoreChats.ts#L121-L138) for normalization |
| `updatedAt` | `unknown` | [firestoreChats.ts:24](../src/lib/firestoreChats.ts#L24) | F | yes | same |

### `ChatGameRef` (subdocument shape)

| Field | Type | Source line | Tier | Nullable | Example |
|---|---|---|---|---|---|
| `firestoreId` | `string` | [firestoreChats.ts:8](../src/lib/firestoreChats.ts#L8) | F | yes | `"gJ3kLmN8oP1q"` |
| `pgn` | `string` | [firestoreChats.ts:9](../src/lib/firestoreChats.ts#L9) | F | yes | `"1. e4 c5 2. Nf3 ..."` |
| `fen` | `string` | [firestoreChats.ts:10](../src/lib/firestoreChats.ts#L10) | F | yes | `"rnbq..."` |
| `opponent` | `string` | [firestoreChats.ts:11](../src/lib/firestoreChats.ts#L11) | F | yes | `"hikarunakamura"` |
| `result` | `string` | [firestoreChats.ts:12](../src/lib/firestoreChats.ts#L12) | F | yes | `"0-1"` |

### `ChatMessageRecord`

| Field | Type | Source line | Tier | Nullable | Example |
|---|---|---|---|---|---|
| `firestoreId` | `string` | [firestoreChats.ts:28](../src/lib/firestoreChats.ts#L28) | F | no | `"msg_xyz"` |
| `role` | `"user" \| "assistant"` | [firestoreChats.ts:29](../src/lib/firestoreChats.ts#L29) | F | no | `"assistant"` |
| `content` | `string` | [firestoreChats.ts:30](../src/lib/firestoreChats.ts#L30) | F | no | `"In rook endings, activate your rook..."` |
| `createdAt` | `unknown` | [firestoreChats.ts:31](../src/lib/firestoreChats.ts#L31) | F | yes | timestamp |
| `feedback` | `"positive" \| "negative"` | [firestoreChats.ts:32](../src/lib/firestoreChats.ts#L32) | F | yes | `"positive"` |

Endpoints: `listChats()`, `getChat()`, `createChat()`, `appendMessage()`, `renameChat()`, `deleteChat()`, `generateChatTitle()` at [firestoreChats.ts:43-119](../src/lib/firestoreChats.ts#L43-L119).

---

## WeaknessProfile — localStorage (key `chess_masti_weakness_profile`) — **CLIENT-ONLY**

Source: [weaknessProfile.ts:7-56](../src/lib/weaknessProfile.ts#L7-L56). Tier **L** (localStorage). Persistence at [weaknessProfile.ts:58,76-94](../src/lib/weaknessProfile.ts#L58-L94). **The agent cannot read this server-side.** The user's browser must upload the blob (or the relevant fields) as part of the agent's incoming context, or the agent must request the upload via a tool-call.

> **Caveat for the agent.** If a user-model tool returns "weakness profile unavailable" while in a coaching turn, the most likely cause is that the blob was never uploaded by the client this session — not that the user has no profile. Ask the client to attach it, or fall back to game-by-game analysis from Firestore games.

### `WeaknessProfile`

| Field | Type | Source line | Tier | Nullable | Example |
|---|---|---|---|---|---|
| `lastUpdated` | `number` (epoch ms) | [weaknessProfile.ts:8](../src/lib/weaknessProfile.ts#L8) | L | no | `1714560000000` |
| `gamesAnalyzed` | `number` | [weaknessProfile.ts:9](../src/lib/weaknessProfile.ts#L9) | L | no | `27` |
| `patterns` | `MistakePattern[]` | [weaknessProfile.ts:10](../src/lib/weaknessProfile.ts#L10) | L | no | `[{...}, {...}]` |
| `phaseAccuracy` | `PhaseAccuracy` | [weaknessProfile.ts:11](../src/lib/weaknessProfile.ts#L11) | L | no | `{opening: {...}, middlegame: {...}, endgame: {...}}` |
| `topWeaknesses` | `string[]` (5 max, severity-filtered, sorted by frequency) | [weaknessProfile.ts:12,160-164](../src/lib/weaknessProfile.ts#L12-L164) | L | no | `["Hanging Pieces", "King Safety"]` |
| `recommendedPuzzleThemes` | `string[]` (mapped from top weaknesses; see [weaknessProfile.ts:261-269](../src/lib/weaknessProfile.ts#L261-L269)) | [weaknessProfile.ts:13](../src/lib/weaknessProfile.ts#L13) | L | no | `["fork", "pin"]` |

### `MistakePattern`

| Field | Type | Source line | Tier | Nullable | Example |
|---|---|---|---|---|---|
| `category` | `string` (one of the eight `MISTAKE_CATEGORIES` keys at [weaknessProfile.ts:62-71](../src/lib/weaknessProfile.ts#L62-L71)) | [weaknessProfile.ts:17](../src/lib/weaknessProfile.ts#L17) | L | no | `"Hanging Pieces"` |
| `count` | `number` | [weaknessProfile.ts:18](../src/lib/weaknessProfile.ts#L18) | L | no | `9` |
| `totalGames` | `number` (denominator for `frequency`) | [weaknessProfile.ts:19](../src/lib/weaknessProfile.ts#L19) | L | no | `27` |
| `frequency` | `number` (`count / totalGames`) | [weaknessProfile.ts:20](../src/lib/weaknessProfile.ts#L20) | L | no | `0.33` |
| `examples` | `MistakeExample[]` (≤5; replaced FIFO past cap, see [weaknessProfile.ts:128-148](../src/lib/weaknessProfile.ts#L128-L148)) | [weaknessProfile.ts:21](../src/lib/weaknessProfile.ts#L21) | L | no | array |
| `severity` | `"critical" \| "frequent" \| "occasional"` (thresholds at [weaknessProfile.ts:151-153](../src/lib/weaknessProfile.ts#L151-L153): ≥0.5 critical, ≥0.25 frequent, else occasional) | [weaknessProfile.ts:22](../src/lib/weaknessProfile.ts#L22) | L | no | `"frequent"` |

### `MistakeExample`

| Field | Type | Source line | Tier | Nullable | Example |
|---|---|---|---|---|---|
| `gameDate` | `string` | [weaknessProfile.ts:26](../src/lib/weaknessProfile.ts#L26) | L | yes | `"2026-04-15"` |
| `moveNumber` | `number` | [weaknessProfile.ts:27](../src/lib/weaknessProfile.ts#L27) | L | no | `18` |
| `movePlayed` | `string` (SAN) | [weaknessProfile.ts:28](../src/lib/weaknessProfile.ts#L28) | L | no | `"Nf3"` |
| `bestMove` | `string` (SAN) | [weaknessProfile.ts:29](../src/lib/weaknessProfile.ts#L29) | L | no | `"d4"` |
| `evalDrop` | `number` (centipawns) | [weaknessProfile.ts:30](../src/lib/weaknessProfile.ts#L30) | L | no | `350` |
| `fen` | `string` | [weaknessProfile.ts:31](../src/lib/weaknessProfile.ts#L31) | L | no | `"rnbq..."` |

### `PhaseAccuracy`

| Field | Type | Source line | Tier | Nullable | Example |
|---|---|---|---|---|---|
| `opening` | `{ totalMoves: number; mistakes: number; accuracy: number }` | [weaknessProfile.ts:35](../src/lib/weaknessProfile.ts#L35) | L | no | `{totalMoves: 240, mistakes: 8, accuracy: 96.7}` |
| `middlegame` | same shape | [weaknessProfile.ts:36](../src/lib/weaknessProfile.ts#L36) | L | no | same |
| `endgame` | same shape | [weaknessProfile.ts:37](../src/lib/weaknessProfile.ts#L37) | L | no | same |

A prompt-injection helper `getWeaknessPromptContext()` at [weaknessProfile.ts:176-211](../src/lib/weaknessProfile.ts#L176-L211) renders this profile into the coaching system prompt — the agent can call this if the profile is in hand, or include the fields it needs directly.

---

## DrillProgress — localStorage via jotai's `atomWithStorage`, key `chessMastiDrillProgress`

Source for the type: [`@/types/openings.ts:69-88`](../src/types/openings.ts#L69-L88). Source for persistence: [spacedRepetition.ts:1,105-108](../src/lib/spacedRepetition.ts#L1-L108) — `atomWithStorage<Record<string, DrillProgress>>("chessMastiDrillProgress", {})`. Map key format: `${repertoireId}/${lineId}` ([spacedRepetition.ts:117-119](../src/lib/spacedRepetition.ts#L117-L119)). Tier **L** (localStorage).

| Field | Type | Source line | Tier | Nullable | Example |
|---|---|---|---|---|---|
| `repertoireId` | `string` | [openings.ts:71](../src/types/openings.ts#L71) | L | no | `"sicilian-najdorf"` |
| `lineId` | `string` | [openings.ts:73](../src/types/openings.ts#L73) | L | no | `"main-line-6Bg5"` |
| `attempts` | `number` | [openings.ts:75](../src/types/openings.ts#L75) | L | no | `4` |
| `correctFirstTry` | `number` | [openings.ts:77](../src/types/openings.ts#L77) | L | no | `3` |
| `maxDepthReached` | `number` (plies) | [openings.ts:79](../src/types/openings.ts#L79) | L | no | `12` |
| `easeFactor` | `number` (SM-2; min `1.3`, default `2.5`) | [openings.ts:81](../src/types/openings.ts#L81), [spacedRepetition.ts:17-18](../src/lib/spacedRepetition.ts#L17-L18) | L | no | `2.4` |
| `interval` | `number` (days) | [openings.ts:83](../src/types/openings.ts#L83) | L | no | `6` |
| `nextReview` | `number` (epoch ms) | [openings.ts:85](../src/types/openings.ts#L85) | L | no | `1715040000000` |
| `lastDrilled` | `number` (epoch ms) | [openings.ts:87](../src/types/openings.ts#L87) | L | no | `1714560000000` |

SM-2 algorithm details at [spacedRepetition.ts:20-57](../src/lib/spacedRepetition.ts#L20-L57); `isDueForReview()` at [spacedRepetition.ts:79-82](../src/lib/spacedRepetition.ts#L79-L82). Quality scale 0–5 documented at [spacedRepetition.ts:5-14](../src/lib/spacedRepetition.ts#L5-L14).

`DrillSession` ([openings.ts:90-101](../src/types/openings.ts#L90-L101)) is in-memory state for an active drill, not persisted.

---

## Repetit Training — localStorage (three keys)

Source: [repetitTraining.ts:18-72](../src/lib/repetitTraining.ts#L18-L72). Tier **L** (localStorage). Three storage keys at [repetitTraining.ts:68-72](../src/lib/repetitTraining.ts#L68-L72): `chess_masti_repetit_training_sets`, `chess_masti_puzzle_attempts`, `chess_masti_puzzle_stats`.

### `RepetitTrainingSet`

| Field | Type | Source line | Tier | Nullable | Example |
|---|---|---|---|---|---|
| `id` | `string` (`"repetit_<ts>_<rand>"`) | [repetitTraining.ts:19,88](../src/lib/repetitTraining.ts#L19-L88) | L | no | `"repetit_1714560000000_a1b2c3d"` |
| `conceptName` | `string` | [repetitTraining.ts:20](../src/lib/repetitTraining.ts#L20) | L | no | `"King Safety"` |
| `theme` | `string` (kebab Neo4j theme id) | [repetitTraining.ts:21](../src/lib/repetitTraining.ts#L21) | L | no | `"exposed-king"` |
| `displayName` | `string` | [repetitTraining.ts:22](../src/lib/repetitTraining.ts#L22) | L | no | `"Repetit Training: King Safety"` |
| `puzzles` | `ChessPuzzle[]` (from [chessPuzzlesService.ts](../src/lib/chessPuzzlesService.ts)) | [repetitTraining.ts:23](../src/lib/repetitTraining.ts#L23) | L | no | array |
| `createdAt` | `number` (epoch ms) | [repetitTraining.ts:24](../src/lib/repetitTraining.ts#L24) | L | no | `1714560000000` |
| `source` | `"ai-coach" \| "manual-selection"` | [repetitTraining.ts:25](../src/lib/repetitTraining.ts#L25) | L | no | `"ai-coach"` |
| `difficulty` | `"beginner" \| "intermediate" \| "advanced"` | [repetitTraining.ts:26](../src/lib/repetitTraining.ts#L26) | L | yes | `"intermediate"` |
| `completedPuzzleIds` | `string[]` | [repetitTraining.ts:29](../src/lib/repetitTraining.ts#L29) | L | no | `["pz1", "pz2"]` |
| `attemptedPuzzleIds` | `string[]` | [repetitTraining.ts:30](../src/lib/repetitTraining.ts#L30) | L | no | `["pz1", "pz2", "pz3"]` |
| `accuracy` | `number` (0-100) | [repetitTraining.ts:31](../src/lib/repetitTraining.ts#L31) | L | no | `66.7` |
| `averageTime` | `number` (seconds per puzzle) | [repetitTraining.ts:32](../src/lib/repetitTraining.ts#L32) | L | yes | `42.5` |
| `lastAttemptedAt` | `number` (epoch ms) | [repetitTraining.ts:33](../src/lib/repetitTraining.ts#L33) | L | yes | `1714560000000` |

### `PuzzleAttempt`

| Field | Type | Source line | Tier | Nullable | Example |
|---|---|---|---|---|---|
| `id` | `string` (`"attempt_<ts>_<rand>"`) | [repetitTraining.ts:37,162](../src/lib/repetitTraining.ts#L37-L162) | L | no | `"attempt_..."` |
| `puzzleId` | `string` | [repetitTraining.ts:38](../src/lib/repetitTraining.ts#L38) | L | no | `"pz1"` |
| `setId` | `string` | [repetitTraining.ts:39](../src/lib/repetitTraining.ts#L39) | L | yes | `"repetit_..."` |
| `userId` | `string` | [repetitTraining.ts:40](../src/lib/repetitTraining.ts#L40) | L | no | `"abc123"` |
| `success` | `boolean` | [repetitTraining.ts:41](../src/lib/repetitTraining.ts#L41) | L | no | `true` |
| `movesPlayed` | `string[]` (SAN) | [repetitTraining.ts:42](../src/lib/repetitTraining.ts#L42) | L | no | `["Qxh7+", "Kxh7", "Rh3#"]` |
| `timeSpentSeconds` | `number` | [repetitTraining.ts:43](../src/lib/repetitTraining.ts#L43) | L | no | `34` |
| `attemptedAt` | `number` (epoch ms) | [repetitTraining.ts:44](../src/lib/repetitTraining.ts#L44) | L | no | `1714560000000` |
| `hintsUsed` | `number` | [repetitTraining.ts:45](../src/lib/repetitTraining.ts#L45) | L | no | `0` |
| `conceptName` | `string` | [repetitTraining.ts:46](../src/lib/repetitTraining.ts#L46) | L | yes | `"King Safety"` |

### `UserPuzzleStats`

| Field | Type | Source line | Tier | Nullable | Example |
|---|---|---|---|---|---|
| `userId` | `string` | [repetitTraining.ts:50](../src/lib/repetitTraining.ts#L50) | L | no | `"abc123"` |
| `totalAttempts` | `number` | [repetitTraining.ts:51](../src/lib/repetitTraining.ts#L51) | L | no | `145` |
| `totalSolved` | `number` | [repetitTraining.ts:52](../src/lib/repetitTraining.ts#L52) | L | no | `92` |
| `accuracy` | `number` (0-100) | [repetitTraining.ts:53](../src/lib/repetitTraining.ts#L53) | L | no | `63.4` |
| `xp` | `number` | [repetitTraining.ts:54](../src/lib/repetitTraining.ts#L54) | L | no | `1450` |
| `currentStreak` | `number` (days with ≥1 puzzle solved) | [repetitTraining.ts:55](../src/lib/repetitTraining.ts#L55) | L | no | `7` |
| `longestStreak` | `number` | [repetitTraining.ts:56](../src/lib/repetitTraining.ts#L56) | L | no | `21` |
| `trainingSetStats` | `Record<string, {attempts, solved, accuracy, lastAttemptedAt}>` | [repetitTraining.ts:57-62](../src/lib/repetitTraining.ts#L57-L62) | L | no | `{ "repetit_...": {...} }` |
| `recentAttempts` | `PuzzleAttempt[]` (last 50) | [repetitTraining.ts:63](../src/lib/repetitTraining.ts#L63) | L | no | array |

---

## OpeningRepertoire + OpeningLine — type-only; persistence layer not fully identified

Source: [`@/types/openings.ts:5-33`](../src/types/openings.ts#L5-L33). Static built-in repertoires are exported from [src/data/repertoires.ts](../src/data/repertoires.ts). User-imported repertoires are produced by `parsePgnToRepertoire()` at [repertoireParser.ts:84-119](../src/lib/repertoireParser.ts#L84-L119); the persistence layer for **user-imported** repertoires is not visible in the current read (no `atomWithStorage` for repertoires, no `/api/repertoires` route observed). **Flagged for verification** before the agent claims it can recall a user's saved repertoires across sessions.

### `OpeningLine`

| Field | Type | Source line | Tier | Nullable | Example |
|---|---|---|---|---|---|
| `id` | `string` | [openings.ts:7](../src/types/openings.ts#L7) | static / runtime | no | `"sicilian-main-Bg5"` |
| `moves` | `string[]` (SAN) | [openings.ts:9](../src/types/openings.ts#L9) | static / runtime | no | `["e4","c5","Nf3","d6",...]` |
| `name` | `string` | [openings.ts:11](../src/types/openings.ts#L11) | static / runtime | no | `"Najdorf — main line"` |
| `description` | `string` | [openings.ts:13](../src/types/openings.ts#L13) | static / runtime | no | `"Black plays ...e5 challenging the centre"` |

### `OpeningRepertoire`

| Field | Type | Source line | Tier | Nullable | Example |
|---|---|---|---|---|---|
| `id` | `string` | [openings.ts:18](../src/types/openings.ts#L18) | static / runtime | no | `"sicilian-najdorf"` |
| `name` | `string` | [openings.ts:20](../src/types/openings.ts#L20) | static / runtime | no | `"Sicilian Najdorf"` |
| `eco` | `string` | [openings.ts:22](../src/types/openings.ts#L22) | static / runtime | no | `"B90"` |
| `color` | `"white" \| "black"` | [openings.ts:24](../src/types/openings.ts#L24) | static / runtime | no | `"black"` |
| `difficulty` | `"beginner" \| "intermediate" \| "advanced"` | [openings.ts:26](../src/types/openings.ts#L26) | static / runtime | no | `"advanced"` |
| `description` | `string` | [openings.ts:28](../src/types/openings.ts#L28) | static / runtime | no | `"Sharp positional weapon..."` |
| `themes` | `string[]` | [openings.ts:30](../src/types/openings.ts#L30) | static / runtime | no | `["counterattack", "queenside-pawn-majority"]` |
| `lines` | `OpeningLine[]` | [openings.ts:32](../src/types/openings.ts#L32) | static / runtime | no | array |

`OpeningChapter` and `OpeningCourse` ([openings.ts:38-67](../src/types/openings.ts#L38-L67)) wrap repertoires for the courses surface; consumed by [api/courses/](../src/app/api/courses/) and [src/data/repertoires.ts](../src/data/repertoires.ts).

---

## Reading patterns

How the agent should fetch each tier in practice.

### Tier F — Firestore via API

Server-side route handlers can either re-call these client wrappers or hit Firebase Admin directly through [src/lib/server/users.ts](../src/lib/server/users.ts) and [src/lib/server/firebaseAdmin.ts](../src/lib/server/firebaseAdmin.ts). For the agent running inside [enhanced-analysis](../src/app/api/enhanced-analysis/route.ts), the user is already resolved from `requireSession()` at [enhanced-analysis/route.ts:21](../src/app/api/enhanced-analysis/route.ts#L21).

| Tier-F shape | Read endpoint | Write endpoint |
|---|---|---|
| `UserProfile` | GET `/api/auth/me` ([firestoreUsers.ts:54-60](../src/lib/firestoreUsers.ts#L54-L60)) | PATCH `/api/users/me` ([firestoreUsers.ts:72-84](../src/lib/firestoreUsers.ts#L72-L84)) |
| `CloudGame[]` | GET `/api/games` ([firestoreGames.ts:28-33](../src/lib/firestoreGames.ts#L28-L33)) | POST `/api/games` ([firestoreGames.ts:35-48](../src/lib/firestoreGames.ts#L35-L48)) |
| Single `CloudGame` | (n/a — list is the read shape) | PATCH `/api/games/{firestoreId}` ([firestoreGames.ts:50-63](../src/lib/firestoreGames.ts#L50-L63)), DELETE `/api/games/{firestoreId}` ([firestoreGames.ts:65-75](../src/lib/firestoreGames.ts#L65-L75)) |
| `ChatRecord[]` | GET `/api/chats` ([firestoreChats.ts:43-48](../src/lib/firestoreChats.ts#L43-L48)) | POST `/api/chats` ([firestoreChats.ts:59-72](../src/lib/firestoreChats.ts#L59-L72)) |
| `ChatRecord + ChatMessageRecord[]` | GET `/api/chats/{chatId}` ([firestoreChats.ts:50-57](../src/lib/firestoreChats.ts#L50-L57)) | PATCH `/api/chats/{chatId}` ([firestoreChats.ts:90-101](../src/lib/firestoreChats.ts#L90-L101)), DELETE same |
| Append message | (n/a) | POST `/api/chats/{chatId}/messages` ([firestoreChats.ts:74-88](../src/lib/firestoreChats.ts#L74-L88)) |
| Auto-titled chat | (n/a) | POST `/api/chats/{chatId}/title` ([firestoreChats.ts:111-119](../src/lib/firestoreChats.ts#L111-L119)) |

The agent should attach the session cookie (`cm_session`) automatically; anonymous calls return 401 from `listChats()` and similar.

### Tier L — localStorage upload required

The agent has no server endpoint to read these. The client must include them in the agent-call payload. Practical patterns:

- Coaching turn that needs `WeaknessProfile`: client reads `localStorage.getItem("chess_masti_weakness_profile")` and attaches as `weaknessProfile` field in the request body (or the agent uses `getWeaknessPromptContext()` at [weaknessProfile.ts:176-211](../src/lib/weaknessProfile.ts#L176-L211) once the client has uploaded the parsed profile).
- Drill scheduling that needs `DrillProgress`: client reads the jotai-persisted `chessMastiDrillProgress` map and attaches it; the agent uses `isDueForReview()` ([spacedRepetition.ts:79-82](../src/lib/spacedRepetition.ts#L79-L82)) on each entry.
- Repetit Training history: client uploads the three keys (`chess_masti_repetit_training_sets`, `chess_masti_puzzle_attempts`, `chess_masti_puzzle_stats`); agent reads as `RepetitTrainingSet[]`, `PuzzleAttempt[]`, `UserPuzzleStats`.

A future tool `read_user_state.upload_local_state(blob)` would formalize this — currently STATUS: design-only (will be listed in MASTERMIND_TOOLS.md).

### Tier I — IndexedDB game cache

Not a primary read target. If the agent ever needs to know which games the **client** has cached locally (vs Firestore), it must request the client run `useGameDatabase`'s `loadGames()` at [useGameDatabase.ts:54-59](../src/hooks/useGameDatabase.ts#L54-L59) and upload the result. For all current coaching purposes, GET `/api/games` (Tier F) is authoritative.

---

## Caveats and discoveries

- **`WeaknessProfile` is `localStorage`-only.** Verified in [weaknessProfile.ts:5,58,76-94](../src/lib/weaknessProfile.ts#L5-L94). The agent cannot read it server-side without a client upload — flagged prominently because the doc-tier of CLAUDE.md implies this is part of the user's persistent profile, but a fresh login on a new device starts with no profile.
- **`OpeningRepertoire` user-imported persistence is not identified.** The parser produces an in-memory object; nothing in [src/lib/](../src/lib/) or [src/app/api/](../src/app/api/) writes user repertoires to Firestore or localStorage in the read I performed. The agent should not promise "I remember the repertoire you imported last week" until this is verified.
- **`UserProfile.rating` vs `UserProfile.selfReportedRating`.** Both fields exist; `selfReportedRating` is user-entered, `rating` is server-derived (per [firestoreUsers.ts:42-44](../src/lib/firestoreUsers.ts#L42-L44) excluding it from `UserProfileUpdates`). The agent should prefer `rating` when available, falling back to `selfReportedRating`.
- **`CoachingPrefs` is not a separate Firestore document.** It's a derived view over `UserProfile`. The agent should not attempt to read or write a "preferences" subdocument — the surface is the user doc itself.
- **Two `MISTAKE_CATEGORIES`-style enums exist.** The category strings in `MistakePattern` come from [weaknessProfile.ts:62-71](../src/lib/weaknessProfile.ts#L62-L71); the puzzle-theme map at [weaknessProfile.ts:261-269](../src/lib/weaknessProfile.ts#L261-L269) translates them to puzzle theme tags. The agent should treat these two enums as a closed set and not invent new categories.
- **Timestamps in Firestore-tier shapes are `unknown`.** Use the `chatTimestampMs()` helper at [firestoreChats.ts:121-138](../src/lib/firestoreChats.ts#L121-L138) for normalization (handles `{_seconds, _nanoseconds}`, ISO strings, and raw millis). The same shape applies to `createdAt` / `updatedAt` on `UserProfile` and `CloudGame`.

Updates to the Tier-L upload protocol will land in MASTERMIND_TOOLS.md (doc #4) under `read_user_state` verbs.
