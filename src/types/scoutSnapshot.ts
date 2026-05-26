// Shared types for the scout snapshot permalinks feature.
// Scout snapshots are point-in-time captures of a /scout report: the games,
// the computed analytics, the opening tree, and (optionally) the comparison
// collisions. Sharing the URL replays the exact view the sharer saw —
// recipients skip the fetch + worker rebuild + re-analysis cycle.

import type {
  Collisions,
  OpeningTreeNode,
  Platform,
  ScoutAnalytics,
  ScoutResult,
} from "@/types/scout";

export interface ScoutSnapshotCreateRequest {
  username: string;
  platform: Platform;
  months: number;
  yourUsername?: string | null;
  scoutResult: ScoutResult;
  analytics: ScoutAnalytics;
  tree: OpeningTreeNode;
  collisions?: Collisions | null;
}

export interface ScoutSnapshotRecord {
  id: string;
  username: string;
  platform: Platform;
  months: number;
  yourUsername: string | null;
  scoutResult: ScoutResult;
  analytics: ScoutAnalytics;
  tree: OpeningTreeNode;
  collisions: Collisions | null;
  sharerUid: string | null;
  createdAt: number;
  viewCount: number;
}

// Sanity caps. Firestore doc limit is ~1MB; we trim aggressively under that
// so headers + metadata leave room. Trimming is silent per acceptance spec.
export const SCOUT_SNAPSHOT_MAX_BYTES = 700_000; // ~700KB
export const SCOUT_SNAPSHOT_MAX_USERNAME_CHARS = 100;
