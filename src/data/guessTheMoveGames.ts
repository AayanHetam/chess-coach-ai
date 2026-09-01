/**
 * Curated famous games for the "Guess the Move" trainer.
 *
 * SAN move lists extracted (via chess.js, comments stripped) from
 * scripts/data-pipeline/output/GM_games.pgn — real, annotated master games
 * already sitting in the repo's data pipeline output but never served
 * anywhere. Picked for a mix of eras, players, and a playable length
 * (43-80 moves).
 */

export interface GuessTheMoveGame {
  id: string;
  white: string;
  black: string;
  event: string;
  year: string;
  result: string;
  /** SAN, in order, from the starting position. */
  moves: string[];
}

export const GUESS_THE_MOVE_GAMES: GuessTheMoveGame[] = [
  {
    id: "steinitz-von-bardeleben-1895",
    white: "Steinitz",
    black: "Von Bardeleben",
    event: "Hastings",
    year: "1895",
    result: "1-0",
    moves: [
      "e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d4", "exd4",
      "cxd4", "Bb4+", "Nc3", "d5", "exd5", "Nxd5", "O-O", "Be6", "Bg5", "Be7",
      "Bxd5", "Bxd5", "Nxd5", "Qxd5", "Bxe7", "Nxe7", "Re1", "f6", "Qe2", "Qd7",
      "Rac1", "c6", "d5", "cxd5", "Nd4", "Kf7", "Ne6", "Rhc8", "Qg4", "g6",
      "Ng5+", "Ke8", "Rxe7+", "Kf8", "Rf7+", "Kg8", "Rg7+", "Kh8", "Rxh7+",
    ],
  },
  {
    id: "fischer-petrosian-1971",
    white: "Fischer",
    black: "Petrosian",
    event: "Candidates Final",
    year: "1971",
    result: "1-0",
    moves: [
      "e4", "c5", "Nf3", "e6", "d4", "cxd4", "Nxd4", "a6", "Bd3", "Nc6",
      "Nxc6", "bxc6", "O-O", "d5", "c4", "Nf6", "cxd5", "cxd5", "exd5", "exd5",
      "Nc3", "Be7", "Qa4+", "Qd7", "Re1", "Qxa4", "Nxa4", "Be6", "Be3", "O-O",
      "Bc5", "Rfe8", "Bxe7", "Rxe7", "b4", "Kf8", "Nc5", "Bc8", "f3", "Rea7",
      "Re5", "Bd7", "Nxd7+", "Rxd7", "Rc1", "Rd6", "Rc7", "Nd7", "Re2", "g6",
      "Kf2", "h5", "f4", "h4", "Kf3", "f5", "Ke3", "d4+", "Kd2", "Nb6",
      "Ree7", "Nd5", "Rf7+", "Ke8", "Rb7", "Nxb4", "Bc4",
    ],
  },
  {
    id: "kasparov-andersson-1981",
    white: "Kasparov",
    black: "Andersson",
    event: "Moscow",
    year: "1981",
    result: "1-0",
    moves: [
      "d4", "Nf6", "c4", "e6", "Nf3", "b6", "a3", "Bb7", "Nc3", "Ne4",
      "Nxe4", "Bxe4", "Nd2", "Bg6", "g3", "Nc6", "e3", "a6", "b4", "b5",
      "cxb5", "axb5", "Bb2", "Na7", "h4", "h6", "d5", "exd5", "Bg2", "c6",
      "O-O", "f6", "Re1", "Be7", "Qg4", "Kf7", "h5", "Bh7", "e4", "dxe4",
      "Bxe4", "Bxe4", "Nxe4", "Nc8", "Rad1", "Ra7", "Nxf6", "gxf6", "Qg6+", "Kf8",
      "Bc1", "d5", "Rd4", "Nd6", "Rg4", "Nf7", "Bxh6+", "Ke8", "Bg7",
    ],
  },
  {
    id: "karpov-timman-1993",
    white: "Karpov",
    black: "Timman",
    event: "FIDE World Championship",
    year: "1993",
    result: "0-1",
    moves: [
      "Nf3", "c5", "c4", "Nc6", "Nc3", "Nf6", "d4", "cxd4", "Nxd4", "e6",
      "a3", "Nxd4", "Qxd4", "b6", "Bf4", "Bc5", "Qd2", "O-O", "Rd1", "Bb7",
      "Bd6", "Bxd6", "Qxd6", "Rc8", "e3", "Re8", "f3", "Rc6", "Qd4", "Ba6",
      "Ne4", "Nxe4", "Qxe4", "Qc7", "Bd3", "g6", "b3", "d5", "cxd5", "Bxd3",
      "Qxd3", "exd5", "Kf2", "Rc3", "Qxd5", "Rcxe3", "Rd2", "Qe7", "Kg3", "Rxb3",
      "a4", "Rb4", "Rd4", "Rxd4", "Qxd4", "Qg5+", "Kh3", "Re2", "Rg1", "Qh5+",
      "Kg3", "Qg5+", "Kh3", "Rd2", "Qc3", "Ra2", "Qd4", "h6", "Qc4", "Qh5+",
      "Kg3", "Qe5+", "Kh3", "Rd2", "Qh4", "Qf5+", "Kg3", "g5", "Qxh6", "Qf4+",
    ],
  },
  {
    id: "browne-tal-1991",
    white: "Browne",
    black: "Tal",
    event: "Pan Pacific Blitz",
    year: "1991",
    result: "1-0",
    moves: [
      "d4", "d5", "c4", "c6", "Nc3", "e5", "cxd5", "cxd5", "e4", "dxe4",
      "Bb5+", "Bd7", "dxe5", "Nc6", "Qd5", "Qe7", "Bf4", "g5", "Bg3", "Bg7",
      "Qxe4", "Nxe5", "Nd5", "f5", "Qe2", "Qd6", "Nf3", "f4", "Nxf4", "gxf4",
      "Bxd7+", "Kxd7", "Rd1", "Nxf3+", "Qxf3", "Re8+", "Kf1", "Bd4", "Bxf4", "Qa6+",
      "Kg1", "Ne7", "Rxd4+",
    ],
  },
];
