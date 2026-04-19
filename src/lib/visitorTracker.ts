import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
  doc,
  getDoc,
  setDoc,
  increment,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

const VISITS_COLLECTION = "site_visits";
const STATS_DOC = "site_stats";

export interface VisitRecord {
  path: string;
  referrer: string;
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  language: string;
  timestamp: Timestamp | null;
  sessionId: string;
  isNewVisitor: boolean;
}

export interface DailyStats {
  date: string;
  visits: number;
  uniqueVisitors: number;
}

export interface SiteStats {
  totalVisits: number;
  totalUniqueVisitors: number;
  updatedAt: Timestamp | null;
}

/**
 * Generate a simple session ID to deduplicate visits within the same session.
 * Persisted in sessionStorage so it survives SPA navigations but not new tabs/sessions.
 */
function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let sid = sessionStorage.getItem("cm_session_id");
  if (!sid) {
    sid = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem("cm_session_id", sid);
  }
  return sid;
}

/**
 * Check if this is a new visitor (first time ever visiting).
 * Uses localStorage to persist a visitor ID across sessions.
 */
function checkNewVisitor(): { visitorId: string; isNew: boolean } {
  if (typeof window === "undefined") return { visitorId: "", isNew: false };
  let vid = localStorage.getItem("cm_visitor_id");
  if (!vid) {
    vid = `v-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem("cm_visitor_id", vid);
    return { visitorId: vid, isNew: true };
  }
  return { visitorId: vid, isNew: false };
}

/**
 * Record a page visit in Firestore.
 * Also increments the global counter doc for fast aggregate reads.
 */
export async function recordVisit(path: string): Promise<void> {
  if (!db) return;
  if (typeof window === "undefined") return;
  if (window.location.hostname === "localhost") return;

  try {
    const sessionId = getSessionId();
    const { isNew } = checkNewVisitor();

    // Write individual visit document
    const visitsRef = collection(db, VISITS_COLLECTION);
    await addDoc(visitsRef, {
      path,
      referrer: document.referrer || "",
      userAgent: navigator.userAgent,
      screenWidth: window.screen.width,
      screenHeight: window.screen.height,
      language: navigator.language,
      timestamp: serverTimestamp(),
      sessionId,
      isNewVisitor: isNew,
    });

    // Increment global counters (atomic)
    const statsRef = doc(db, STATS_DOC, "global");
    const statsSnap = await getDoc(statsRef);
    if (statsSnap.exists()) {
      await setDoc(
        statsRef,
        {
          totalVisits: increment(1),
          ...(isNew ? { totalUniqueVisitors: increment(1) } : {}),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
    } else {
      await setDoc(statsRef, {
        totalVisits: 1,
        totalUniqueVisitors: isNew ? 1 : 0,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (err) {
    // Silently fail — analytics should never break the app
    console.warn("[VisitorTracker] Failed to record visit:", err);
  }
}

/**
 * Get aggregate site stats from the fast counter doc.
 */
export async function getSiteStats(): Promise<SiteStats | null> {
  if (!db) return null;
  try {
    const statsRef = doc(db, STATS_DOC, "global");
    const snap = await getDoc(statsRef);
    if (!snap.exists()) return null;
    return snap.data() as SiteStats;
  } catch (err) {
    console.warn("[VisitorTracker] Failed to get stats:", err);
    return null;
  }
}

/**
 * Get recent visits for a dashboard view.
 */
export async function getRecentVisits(count: number = 100): Promise<VisitRecord[]> {
  if (!db) return [];
  try {
    const visitsRef = collection(db, VISITS_COLLECTION);
    const q = query(visitsRef, orderBy("timestamp", "desc"), limit(count));
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as VisitRecord);
  } catch (err) {
    console.warn("[VisitorTracker] Failed to get recent visits:", err);
    return [];
  }
}

/**
 * Get visits for a specific date range grouped by day.
 */
export async function getDailyVisitStats(daysBack: number = 30): Promise<DailyStats[]> {
  if (!db) return [];
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    cutoff.setHours(0, 0, 0, 0);

    const visitsRef = collection(db, VISITS_COLLECTION);
    const q = query(
      visitsRef,
      where("timestamp", ">=", Timestamp.fromDate(cutoff)),
      orderBy("timestamp", "asc")
    );
    const snap = await getDocs(q);

    // Group by day
    const dailyMap = new Map<string, { visits: number; sessions: Set<string> }>();

    for (const d of snap.docs) {
      const data = d.data() as VisitRecord;
      if (!data.timestamp) continue;
      const date = (data.timestamp as Timestamp).toDate().toISOString().slice(0, 10);
      const entry = dailyMap.get(date) || { visits: 0, sessions: new Set<string>() };
      entry.visits++;
      if (data.sessionId) entry.sessions.add(data.sessionId);
      dailyMap.set(date, entry);
    }

    return Array.from(dailyMap.entries()).map(([date, data]) => ({
      date,
      visits: data.visits,
      uniqueVisitors: data.sessions.size,
    }));
  } catch (err) {
    console.warn("[VisitorTracker] Failed to get daily stats:", err);
    return [];
  }
}

/**
 * Get page path breakdown (most visited pages).
 */
export async function getPageBreakdown(daysBack: number = 30): Promise<{ path: string; count: number }[]> {
  if (!db) return [];
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - daysBack);
    cutoff.setHours(0, 0, 0, 0);

    const visitsRef = collection(db, VISITS_COLLECTION);
    const q = query(
      visitsRef,
      where("timestamp", ">=", Timestamp.fromDate(cutoff)),
      orderBy("timestamp", "asc")
    );
    const snap = await getDocs(q);

    const pathMap = new Map<string, number>();
    for (const d of snap.docs) {
      const data = d.data() as VisitRecord;
      const count = pathMap.get(data.path) || 0;
      pathMap.set(data.path, count + 1);
    }

    return Array.from(pathMap.entries())
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count);
  } catch (err) {
    console.warn("[VisitorTracker] Failed to get page breakdown:", err);
    return [];
  }
}
