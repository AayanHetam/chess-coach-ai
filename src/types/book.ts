/** One rating band's opening book: what players at that level actually play. */
export interface OpeningBook {
  meta: OpeningBookMeta;
  /**
   * 4-field EPD → the moves played from it, share-descending.
   *
   * `[san, perMille]`. Every move at or above the build's `minShare` is here,
   * with no top-N cap: the book answers a MEMBERSHIP question about a real
   * person's game, and a cap would call a move played by 3% of the band out of
   * book purely because six others were more popular.
   */
  book: Record<string, Array<[string, number]>>;
}

export interface OpeningBookMeta {
  band: string;
  /** Which rating scale the band was cut on. Refused at load if it is wrong. */
  bandScale: string | null;
  source: string | null;
  games: number | null;
  /** Plies the corpus was built to. Past this the book has nothing to say. */
  maxPly: number | null;
  corpusPositions: number;
  positions: number;
  minGames: number;
  minShare: number;
  generatedFrom: string;
  shares: string;
}
