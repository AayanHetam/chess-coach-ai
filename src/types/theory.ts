// Wire types for opening theory.
//
// Separate from the loader on purpose. `src/lib/theory/wikibooksTheory.ts`
// imports `fs`, so anything a client component touches must not lead back to
// it — an `import type` is erased, but a later hand turning it into a value
// import would drag Node built-ins into a page bundle and fail at build time
// with a message that points nowhere near the cause.

/** An excerpt plus everything needed to credit it, as CC BY-SA requires. */
export interface OpeningTheory {
  name?: string;
  eco?: string;
  /** Verbatim. Never paraphrased, summarised, or passed through a model. */
  excerpt: string;
  sourceUrl: string;
  sourceTitle: string;
  licence: string;
  licenceUrl: string;
}

export interface TheoryCorpusInfo {
  positions: number;
  source: string;
  url: string;
  licence: string;
  builtAt: string;
}
