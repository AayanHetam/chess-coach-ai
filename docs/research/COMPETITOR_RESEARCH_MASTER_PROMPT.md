# Competitor Research — Master Prompt (cross-LLM)

Paste the block below into Grok, Claude, Gemini, and ChatGPT (each with web
search/browsing ON), then hand all four responses back for synthesis. Purpose:
close the competitor gaps the 2026-07-05 audit left open (Chessvia,
chesscoach.dev, Take Take Take coach, Reddit sentiment) — see
`docs/COACH_ARCHITECTURE_AND_ACCURACY_AUDIT.md` §5.6/§5.7. The tri-bucket
VERIFIED/INFERRED/UNKNOWN format + running it across 4 models is deliberate:
it lets the synthesis step catch single-model hallucinations by cross-check.

---

ROLE & MISSION
You are a senior technical competitive-intelligence analyst who specializes in the
architecture of AI products. I am researching how AI chess-coaching products are built —
specifically the ENGINE + NATURAL-LANGUAGE + GROUNDING/VERIFICATION stack behind each one —
so I can understand the current state of the art. I need architecture and evidence, not
marketing copy. Depth on what you can verify beats breadth of guesses.

WHAT TO RESEARCH
Primary targets (spend most of your effort here):
1. Chessvia — an AI chess coach (chessvia.com or similar; if the name is ambiguous, list the
   candidates and say which one you mean).
2. chesscoach.dev — the indie site AND, kept clearly separate, Chris Butner's open-source
   "ChessCoach" project (chrisbutner.github.io/ChessCoach). Distinguish the two.
3. Take Take Take (taketaketake.com, Magnus Carlsen's app) — specifically its AI coach / AI
   game-review feature, not the app in general.
4. DecodeChess (decodechess.com) — its explainable-AI analysis engine.
Secondary / landscape (cover briefly):
5. Chess.com "Game Review" + "Coach" explanations, and the newer "Play Celebrity Coach" — is
   each LLM-based or algorithmic/templated?
6. Maia / Maia-2 (maiachess.com, U-Toronto CSSLab) and how coaching products consume it.
7. The academic lineage of chess-commentary generation (Jhamtani 2018 → concept-guided/CCC →
   any 2024–2026 "grounded chess reasoning" work) — only the parts relevant to keeping an
   LLM factually correct about a position.
8. Any other AI chess coach you know of (Noctie.ai, ChessLogix, ChatGPT/Claude wrappers, etc.).

QUESTIONS PER PRODUCT (the architecture dimensions I care about)
- What it is: maker/company, status (live / beta / dead), platform, pricing, launch date.
- Engine layer: which engine(s)? Stockfish / Lc0 / Maia / custom? depth or settings if known.
- Language generation: an LLM (which model + vendor?), templated/symbolic text, or a
  custom-trained/fine-tuned model? Be specific.
- Grounding/verification: HOW do they keep chess claims factually correct? (e.g. human review,
  a structured "data-contract" context fed to the LLM, closed-world symbolic templates,
  engine-fact injection, or nothing?)
- Training/fine-tuning: do they train or fine-tune any model? on what data?
- Data sources: master games, puzzle databases, scraped commentary datasets.
- Latency & UX: response time; format (per-move game review / chat / voice / board annotations).
- User sentiment: what do REAL users (Reddit r/chess & r/chessbeginners, X/Twitter, chess.com
  forums, App Store / Play Store reviews) say specifically about ACCURACY and hallucination?
  Quote representative comments with thread/post URLs and approximate dates.
- Differentiators & weaknesses.

HARD RULES — this determines whether your answer is usable:
1. Cite a source URL for every non-obvious factual claim. Prefer PRIMARY sources (official
   docs, engineering blogs, patents, founder interviews, conference talks, job postings,
   app-store listings) over marketing pages or secondhand blogs.
2. For EACH product, explicitly separate three buckets: (A) VERIFIED — backed by a source you
   cite; (B) INFERRED — your own reasoning, labeled as such; (C) UNKNOWN — say so plainly.
   Never blur them.
3. Do NOT invent architecture details, model names, funding, team members, or user quotes.
   If unsure, mark it UNKNOWN. A short honest answer beats a long plausible-sounding
   fabrication — I am running this same prompt across four different LLMs and will catch
   invented claims by cross-checking.
4. Reddit/forum sentiment: only quote comments you can actually reference (thread title + URL).
   If you can't access or recall specific threads, write "no verifiable threads found" rather
   than paraphrasing imagined ones.
5. Do not pad with generic chess-coaching commentary. Obscure product with little verified
   info → say exactly that.

META (put this at the very top of your answer)
- Which model are you (name + version) and what is your knowledge cutoff?
- Did you use live web search/browsing for this answer or only training knowledge? If you can
  browse, please do, and give access dates for what you cite.

OUTPUT FORMAT
Start with the META block, then one section per product using this EXACT template:

=== [Product name] ===
Confidence: High / Medium / Low / No-data
What it is:
Engine layer:
Language generation:
Grounding/verification:
Training/fine-tuning:
Data sources:
Latency & UX:
User sentiment (with URLs):
Differentiators & weaknesses:
VERIFIED / INFERRED / UNKNOWN: (bullet the key claims under each of the three labels)
Sources: (numbered list of URLs, each with a one-line note on how credible it is)

Finish with:
=== Cross-cutting synthesis ===
- The 2–4 DISTINCT architecture patterns you see across these products (e.g. closed-world
  symbolic templates; LLM over structured engine context; human-in-the-loop review;
  weight-level fine-tuning), and which products use which.
- Your single highest-confidence finding, and your single biggest uncertainty.

---

## When responses come back

Label each paste with the model (e.g. "GROK:", "GEMINI:"). Synthesis will:
cross-verify every claim across the 4; flag single-model-only claims as likely
hallucination; keep corroborated or primary-sourced claims; spot-check
load-bearing URLs; fold confirmed findings into the audit's §5 competitor
section.
