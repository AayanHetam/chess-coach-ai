import type { Square, PieceSymbol } from "chess.js";

export interface Refutation {
  move: string;
  refuted_by: "check" | "recapture" | "counter_threat";
}

interface BaseMotif {
  confirmed: boolean;
  refutation: Refutation | null;
}

export interface ForkMotif extends BaseMotif {
  motif: "fork";
  by_piece: PieceSymbol;
  by_square: Square;
  targets: Array<{ square: Square; piece: PieceSymbol }>;
  unavoidable_loss_cp: number;
}

export interface PinMotif extends BaseMotif {
  motif: "pin";
  kind: "absolute" | "relative";
  /**
   * Did the move being described create this pin? detectMotifs scans every
   * slider after the move (a mover can open a ray for a piece that never
   * moved), so it also sees pins that were already on the board. Those are
   * still true — and still license the word "pinned" — but "Bg5 pins the
   * knight" is only a fact about Bg5 when this is true. Absent on motifs
   * built before the field existed (cached contracts, hand-built fixtures).
   */
  createdByMove?: boolean;
  pinner: { square: Square; piece: PieceSymbol };
  pinned: { square: Square; piece: PieceSymbol };
  behind: { square: Square; piece: PieceSymbol };
  ray: string;
}

export interface SkewerMotif extends BaseMotif {
  motif: "skewer";
  skewerer: { square: Square; piece: PieceSymbol };
  front: { square: Square; piece: PieceSymbol };
  back: { square: Square; piece: PieceSymbol };
  ray: string;
}

export interface DiscoveredAttackMotif extends BaseMotif {
  motif: "discovered_attack";
  mover: { from: Square; to: Square; piece: PieceSymbol };
  revealer: { square: Square; piece: PieceSymbol };
  victim: { square: Square; piece: PieceSymbol };
  also_check: boolean;
  double_attack_target: { square: Square; piece: PieceSymbol } | null;
}

export interface RemovedDefenderMotif extends BaseMotif {
  motif: "removed_defender";
  removed: { square: Square; piece: PieceSymbol };
  was_defending: { square: Square; piece: PieceSymbol };
  follow_up_move: string;
  material_or_mate_gain: "mate" | number;
}

export interface HangingPieceMotif extends BaseMotif {
  motif: "hanging_piece";
  square: Square;
  piece: PieceSymbol;
  attackers: Array<{ square: Square; piece: PieceSymbol }>;
  defenders: Array<{ square: Square; piece: PieceSymbol }>;
  see_value_cp: number;
}

export interface TrappedPieceMotif extends BaseMotif {
  motif: "trapped_piece";
  square: Square;
  piece: PieceSymbol;
  escape_squares_checked: Square[];
  all_unsafe_because: Array<{ square: Square; threatened_by: Square }>;
}

export interface BackRankMateMotif extends BaseMotif {
  motif: "back_rank_mate" | "back_rank_threat";
  delivering_square: Square;
  delivering_piece: PieceSymbol;
  king_square: Square;
  escape_squares_blocked_by: Array<{ square: Square; blocker: "own_piece" | "attacked" }>;
  interposers: Square[];
}

export type AnyMotif =
  | ForkMotif
  | PinMotif
  | SkewerMotif
  | DiscoveredAttackMotif
  | RemovedDefenderMotif
  | HangingPieceMotif
  | TrappedPieceMotif
  | BackRankMateMotif;
