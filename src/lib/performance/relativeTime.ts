/**
 * "2h ago" / "3d ago" for the recent-games rows.
 *
 * `now` is an explicit parameter rather than an internal `Date.now()` call so
 * the behaviour is testable without freezing the clock, and so a list renders
 * against one consistent instant instead of drifting mid-render.
 */
export function formatRelativeTime(timestamp: number, now: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  const diff = now - timestamp;
  // Clock skew between us and the platform can put a game slightly in the
  // future. "in 4 seconds" would be nonsense; "just now" is honest.
  if (diff < 60_000) return "just now";

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (days < 30) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}
