/**
 * Lichess Board API Service
 * Handles real-time game streaming, moves, and challenges
 */

export interface GameState {
  type: 'gameState' | 'gameFull';
  id: string;
  variant: {
    key: string;
    name: string;
  };
  speed: string;
  perf: string;
  rated: boolean;
  initialFen: string;
  fen: string;
  player: 'white' | 'black';
  turns: number;
  startedAtTurn?: number;
  source?: string;
  status: {
    name: string;
    id: number;
  };
  createdAt: number;
  lastMove?: string;
  moves?: string;
  wtime?: number;
  btime?: number;
  winc?: number;
  binc?: number;
  winner?: 'white' | 'black';
  white?: PlayerInfo;
  black?: PlayerInfo;
}

export interface PlayerInfo {
  aiLevel?: number;
  id?: string;
  name: string;
  title?: string;
  rating?: number;
  provisional?: boolean;
}

export interface Challenge {
  id: string;
  url: string;
  status: 'created' | 'offline' | 'canceled' | 'declined' | 'accepted';
  challenger: PlayerInfo;
  destUser?: PlayerInfo;
  variant: {
    key: string;
    name: string;
  };
  rated: boolean;
  speed: string;
  timeControl: {
    type: string;
    limit?: number;
    increment?: number;
    show?: string;
  };
  color: 'random' | 'white' | 'black';
  perf: {
    icon: string;
    name: string;
  };
}

export interface SeekOptions {
  rated?: boolean;
  time: number; // Initial time in minutes
  increment: number; // Increment in seconds
  variant?: 'standard' | 'chess960' | 'crazyhouse' | 'antichess' | 'atomic' | 'horde' | 'kingOfTheHill' | 'racingKings' | 'threeCheck';
  color?: 'random' | 'white' | 'black';
  ratingRange?: string; // e.g., "1500-2000"
}

export interface ChallengeOptions {
  rated?: boolean;
  'clock.limit'?: number; // Clock initial time in seconds
  'clock.increment'?: number; // Clock increment in seconds
  days?: number; // For correspondence games
  color?: 'random' | 'white' | 'black';
  variant?: string;
  fen?: string; // Custom starting position
}

/**
 * Stream incoming events (challenges, game starts)
 */
export async function* streamEvents(accessToken: string): AsyncGenerator<any> {
  const response = await fetch('https://lichess.org/api/stream/event', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/x-ndjson',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to stream events: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          yield JSON.parse(line);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Stream a specific game's state
 */
export async function* streamGameState(gameId: string, accessToken: string): AsyncGenerator<GameState> {
  const response = await fetch(`https://lichess.org/api/board/game/stream/${gameId}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/x-ndjson',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to stream game state: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.trim()) {
          yield JSON.parse(line);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Make a move in a game
 */
export async function makeMove(gameId: string, move: string, accessToken: string): Promise<boolean> {
  const response = await fetch(`https://lichess.org/api/board/game/${gameId}/move/${move}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.ok;
}

/**
 * Send a message in game chat
 */
export async function sendChat(
  gameId: string,
  room: 'player' | 'spectator',
  text: string,
  accessToken: string
): Promise<void> {
  await fetch(`https://lichess.org/api/board/game/${gameId}/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ room, text }),
  });
}

/**
 * Abort a game
 */
export async function abortGame(gameId: string, accessToken: string): Promise<boolean> {
  const response = await fetch(`https://lichess.org/api/board/game/${gameId}/abort`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.ok;
}

/**
 * Resign a game
 */
export async function resignGame(gameId: string, accessToken: string): Promise<boolean> {
  const response = await fetch(`https://lichess.org/api/board/game/${gameId}/resign`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.ok;
}

/**
 * Create a seek (matchmaking request)
 */
export async function createSeek(options: SeekOptions, accessToken: string): Promise<void> {
  const params = new URLSearchParams({
    rated: String(options.rated ?? false),
    time: String(options.time),
    increment: String(options.increment),
  });

  if (options.variant && options.variant !== 'standard') {
    params.append('variant', options.variant);
  }
  if (options.color && options.color !== 'random') {
    params.append('color', options.color);
  }
  if (options.ratingRange) {
    params.append('ratingRange', options.ratingRange);
  }

  const response = await fetch('https://lichess.org/api/board/seek', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Failed to create seek: ${response.statusText}`);
  }
}

/**
 * Challenge a specific user
 */
export async function challengeUser(
  username: string,
  options: ChallengeOptions,
  accessToken: string
): Promise<Challenge> {
  const params = new URLSearchParams({
    rated: String(options.rated ?? false),
  });

  if (options['clock.limit'] && options['clock.increment'] !== undefined) {
    params.append('clock.limit', String(options['clock.limit']));
    params.append('clock.increment', String(options['clock.increment']));
  } else if (options.days) {
    params.append('days', String(options.days));
  }

  if (options.color && options.color !== 'random') {
    params.append('color', options.color);
  }
  if (options.variant) {
    params.append('variant', options.variant);
  }
  if (options.fen) {
    params.append('fen', options.fen);
  }

  const response = await fetch(`https://lichess.org/api/challenge/${username}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  if (!response.ok) {
    throw new Error(`Failed to challenge user: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Accept a challenge
 */
export async function acceptChallenge(challengeId: string, accessToken: string): Promise<boolean> {
  const response = await fetch(`https://lichess.org/api/challenge/${challengeId}/accept`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.ok;
}

/**
 * Decline a challenge
 */
export async function declineChallenge(challengeId: string, accessToken: string): Promise<boolean> {
  const response = await fetch(`https://lichess.org/api/challenge/${challengeId}/decline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.ok;
}

/**
 * Handle draw offers
 */
export async function handleDrawOffer(
  gameId: string,
  accept: boolean,
  accessToken: string
): Promise<boolean> {
  const endpoint = accept ? 'draw/yes' : 'draw/no';
  const response = await fetch(`https://lichess.org/api/board/game/${gameId}/${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.ok;
}

/**
 * Claim victory when opponent has left
 */
export async function claimVictory(gameId: string, accessToken: string): Promise<boolean> {
  const response = await fetch(`https://lichess.org/api/board/game/${gameId}/claim-victory`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  return response.ok;
}
