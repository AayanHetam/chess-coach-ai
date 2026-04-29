/**
 * Visit-tracking shim. Pre-migration this wrote directly to Firestore from
 * the browser; that path is blocked on networks that filter Firebase
 * domains. Until a server-side /api/visits proxy lands, all reads return
 * empty data and writes are no-ops so the UI compiles and renders without
 * crashing the /site-stats page.
 *
 * TODO (post-Phase-5): build /api/visits with Admin SDK and route both
 * the recorder in AnalyticsProvider and the dashboard reads through it.
 */

export interface VisitRecord {
  path: string;
  referrer: string;
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  language: string;
  timestamp: unknown;
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
  updatedAt: unknown;
}

export async function recordVisit(_path: string): Promise<void> {
  void _path;
}

export async function getSiteStats(): Promise<SiteStats | null> {
  return null;
}

export async function getRecentVisits(_count: number = 100): Promise<VisitRecord[]> {
  void _count;
  return [];
}

export async function getDailyVisitStats(_daysBack: number = 30): Promise<DailyStats[]> {
  void _daysBack;
  return [];
}

export async function getPageBreakdown(
  _daysBack: number = 30
): Promise<{ path: string; count: number }[]> {
  void _daysBack;
  return [];
}
