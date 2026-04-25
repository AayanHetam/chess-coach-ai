/**
 * Lichess OAuth Integration Service
 * Implements OAuth 2.0 with PKCE for secure authentication
 */

export interface LichessOAuthConfig {
  clientId: string;
  redirectUri: string;
  scopes: string[];
}

export interface LichessTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
}

/**
 * Shape of GET https://lichess.org/api/account (subset we care about).
 * See: https://lichess.org/api#tag/Account/operation/accountMe
 */
export interface LichessAccountResponse {
  id: string;
  username: string;
  title?: string;
  online?: boolean;
  playing?: boolean | string;
  patron?: boolean;
  perfs?: Record<
    string,
    {
      games?: number;
      rating?: number;
      rd?: number;
      prog?: number;
      prov?: boolean;
    }
  >;
}

/**
 * Flattened profile we surface to the UI. `rating` is the best guess of
 * the user's active rating (priority: blitz → rapid → bullet → classical).
 */
export interface LichessUserProfile {
  id: string;
  username: string;
  title?: string;
  rating?: number;
  ratingPerf?: string;
  /** All established per-speed ratings (keyed by perf name). */
  perfs?: Record<string, number>;
  online: boolean;
  playing?: boolean;
  patron?: boolean;
}

/**
 * Pick the most representative rating from Lichess' perf bag. Blitz is the
 * most commonly played time class, so it gets priority; then rapid, bullet,
 * classical. Falls back to any perf with at least 10 games to avoid
 * surfacing the “1500 provisional” default for brand-new accounts.
 */
export function pickPrimaryRating(
  perfs: LichessAccountResponse['perfs']
): { rating?: number; perf?: string } {
  if (!perfs) return {};
  const priority = ['blitz', 'rapid', 'bullet', 'classical'];
  for (const key of priority) {
    const p = perfs[key];
    if (p?.rating && (p.games ?? 0) > 0) return { rating: p.rating, perf: key };
  }
  // Fallback: any established perf.
  for (const [key, p] of Object.entries(perfs)) {
    if (p?.rating && (p.games ?? 0) >= 10) return { rating: p.rating, perf: key };
  }
  return {};
}

/**
 * Generate a cryptographically secure random string for PKCE
 */
function generateRandomString(length: number): string {
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values)
    .map((x) => possible[x % possible.length])
    .join('');
}

/**
 * Generate SHA-256 hash for PKCE code challenge
 */
async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}

/**
 * Base64 URL encode (RFC 4648 § 5)
 */
function base64urlencode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Generate PKCE code verifier and challenge
 */
export async function generatePKCE(): Promise<{
  codeVerifier: string;
  codeChallenge: string;
}> {
  const codeVerifier = generateRandomString(128);
  const hashed = await sha256(codeVerifier);
  const codeChallenge = base64urlencode(hashed);

  return { codeVerifier, codeChallenge };
}

/**
 * Build Lichess OAuth authorization URL
 */
export function buildAuthUrl(config: LichessOAuthConfig, codeChallenge: string, state: string): string {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    scope: config.scopes.join(' '),
    code_challenge_method: 'S256',
    code_challenge: codeChallenge,
    state,
  });

  return `https://lichess.org/oauth?${params.toString()}`;
}

/**
 * Exchange authorization code for access token
 */
export async function exchangeCodeForToken(
  config: LichessOAuthConfig,
  code: string,
  codeVerifier: string
): Promise<LichessTokenResponse> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    code_verifier: codeVerifier,
    redirect_uri: config.redirectUri,
    client_id: config.clientId,
  });

  const response = await fetch('https://lichess.org/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Token exchange failed: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Get authenticated user's profile and flatten to {@link LichessUserProfile}.
 */
export async function getUserProfile(accessToken: string): Promise<LichessUserProfile> {
  const response = await fetch('https://lichess.org/api/account', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch user profile: ${response.statusText}`);
  }

  const raw = (await response.json()) as LichessAccountResponse;
  const { rating, perf } = pickPrimaryRating(raw.perfs);

  // Build a map of all established per-speed ratings.
  const perfs: Record<string, number> = {};
  if (raw.perfs) {
    for (const [key, p] of Object.entries(raw.perfs)) {
      if (p?.rating && (p.games ?? 0) > 0) {
        perfs[key] = p.rating;
      }
    }
  }

  return {
    id: raw.id,
    username: raw.username,
    title: raw.title,
    rating,
    ratingPerf: perf,
    perfs: Object.keys(perfs).length > 0 ? perfs : undefined,
    online: raw.online ?? true,
    playing: typeof raw.playing === 'string' ? true : !!raw.playing,
    patron: raw.patron,
  };
}

/**
 * Revoke access token
 */
export async function revokeToken(accessToken: string): Promise<void> {
  await fetch('https://lichess.org/api/token', {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
}

/**
 * OAuth Scopes available:
 * - preference:read - Read preferences
 * - preference:write - Write preferences
 * - email:read - Read email address
 * - challenge:read - Read incoming challenges
 * - challenge:write - Create, accept, decline challenges
 * - challenge:bulk - Create, delete, query bulk pairings
 * - study:read - Read private studies
 * - study:write - Create, update, delete studies
 * - tournament:write - Create tournaments
 * - racer:write - Create and join puzzle races
 * - puzzle:read - Read puzzle activity
 * - team:read - Read private team information
 * - team:write - Join, leave, and manage teams
 * - follow:read - Read followed players
 * - follow:write - Follow and unfollow players
 * - msg:write - Send private messages
 * - board:play - Play games with the Board API (REQUIRED FOR LIVE PLAY)
 * - bot:play - Play games with the Bot API
 * - engine:read - Read engine evaluation
 * - engine:write - Request engine evaluations
 */
export const LICHESS_SCOPES = {
  BOARD_PLAY: 'board:play',
  CHALLENGE_READ: 'challenge:read',
  CHALLENGE_WRITE: 'challenge:write',
  PREFERENCE_READ: 'preference:read',
} as const;

/**
 * Minimum set of scopes needed for our embedded live-play experience.
 * Keep this tight — users are shown the full list in Lichess's consent screen.
 */
export const DEFAULT_LIVE_PLAY_SCOPES: readonly string[] = [
  LICHESS_SCOPES.BOARD_PLAY,
  LICHESS_SCOPES.CHALLENGE_READ,
  LICHESS_SCOPES.CHALLENGE_WRITE,
  LICHESS_SCOPES.PREFERENCE_READ,
] as const;

/**
 * Build the OAuth config from env vars with safe defaults for local dev.
 * Used by both the /auth and /callback routes to guarantee they agree on
 * clientId, redirectUri, and scopes.
 */
export function buildOAuthConfig(
  requestOrigin?: string
): LichessOAuthConfig {
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ||
    requestOrigin ||
    'http://localhost:3000';
  return {
    clientId: process.env.NEXT_PUBLIC_LICHESS_CLIENT_ID || 'chessmasti-live',
    redirectUri: `${appUrl}/api/lichess/callback`,
    scopes: [...DEFAULT_LIVE_PLAY_SCOPES],
  };
}
