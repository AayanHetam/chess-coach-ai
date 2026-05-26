// ─────────────────────────────────────────────────────────────────────────────
// Server-side helpers for the `scouts` Firestore collection (snapshot
// permalinks for /scout reports).
//
// Server-only — uses Firebase Admin. Includes a silent tree-trimming step
// that progressively shrinks the opening tree if the serialized payload
// exceeds Firestore's ~1MB doc limit. Per product spec: trim silently
// rather than surface an error to the user.
// ─────────────────────────────────────────────────────────────────────────────

import { FieldValue } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/server/firebaseAdmin";
import type { OpeningTreeNode } from "@/types/scout";
import type {
  ScoutSnapshotCreateRequest,
  ScoutSnapshotRecord,
} from "@/types/scoutSnapshot";
import { SCOUT_SNAPSHOT_MAX_BYTES } from "@/types/scoutSnapshot";

const COLLECTION = "scouts";

// Cap tree depth recursively. depth=0 means strip all children.
function trimTreeDepth(node: OpeningTreeNode, depth: number): OpeningTreeNode {
  if (depth <= 0) {
    return { ...node, children: [] };
  }
  return {
    ...node,
    children: (node.children || []).map((c) => trimTreeDepth(c, depth - 1)),
  };
}

// Progressively shrink the tree until the full payload fits under the byte
// cap. We measure the WHOLE doc each pass because metadata (analytics,
// scoutResult.games) also contributes to size.
function shrinkPayloadToFit(
  data: ScoutSnapshotCreateRequest
): ScoutSnapshotCreateRequest {
  const passes = [25, 18, 12, 8, 4, 1, 0];
  let current = data;
  for (const depth of passes) {
    const trimmed: ScoutSnapshotCreateRequest = {
      ...current,
      tree: depth === 0 ? { ...current.tree, children: [] } : trimTreeDepth(current.tree, depth),
    };
    if (JSON.stringify(trimmed).length <= SCOUT_SNAPSHOT_MAX_BYTES) {
      return trimmed;
    }
    current = trimmed;
  }
  // Even with empty tree, payload may exceed limit if scoutResult.games is
  // enormous. Final fallback: strip games array down to its first 200 entries.
  return {
    ...current,
    scoutResult: {
      ...current.scoutResult,
      games: (current.scoutResult.games || []).slice(0, 200),
    },
  };
}

export async function createScoutSnapshot(
  data: ScoutSnapshotCreateRequest,
  sharerUid: string | null
): Promise<string> {
  const db = await getAdminFirestore();
  const fitted = shrinkPayloadToFit(data);
  const ref = db.collection(COLLECTION).doc();
  await ref.set({
    username: fitted.username,
    platform: fitted.platform,
    months: fitted.months,
    yourUsername: fitted.yourUsername ?? null,
    scoutResult: fitted.scoutResult,
    analytics: fitted.analytics,
    tree: fitted.tree,
    collisions: fitted.collisions ?? null,
    sharerUid,
    createdAt: FieldValue.serverTimestamp(),
    viewCount: 0,
  });
  return ref.id;
}

export async function getScoutSnapshot(
  id: string
): Promise<ScoutSnapshotRecord | null> {
  const db = await getAdminFirestore();
  const ref = db.collection(COLLECTION).doc(id);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const raw = snap.data() ?? {};
  ref.update({ viewCount: FieldValue.increment(1) }).catch((err) => {
    console.error("[scouts] viewCount increment failed for", id, err);
  });
  const createdAtMs =
    raw.createdAt && typeof raw.createdAt.toMillis === "function"
      ? raw.createdAt.toMillis()
      : Date.now();
  return {
    id,
    username: String(raw.username ?? ""),
    platform: raw.platform === "lichess" ? "lichess" : "chess.com",
    months: typeof raw.months === "number" ? raw.months : 12,
    yourUsername: raw.yourUsername ?? null,
    scoutResult: raw.scoutResult,
    analytics: raw.analytics,
    tree: raw.tree,
    collisions: raw.collisions ?? null,
    sharerUid: raw.sharerUid ?? null,
    createdAt: createdAtMs,
    viewCount: typeof raw.viewCount === "number" ? raw.viewCount : 0,
  };
}
