# Lichess Live Play Integration 🎮♟️

## Overview

ChessMasti now supports **live game integration with Lichess**! Users can connect their Lichess accounts and play rated/unrated games directly through ChessMasti, similar to TakeTakeTake's implementation.

## Features

✅ **OAuth 2.0 Authentication** - Secure PKCE-based authentication
✅ **Live Game Matchmaking** - Find opponents at various time controls
✅ **Real-time Game Streaming** - Monitor game state and moves
✅ **Multiple Time Controls** - Bullet, Blitz, Rapid, Classical
✅ **Rated & Unrated Games** - Choose your game mode
✅ **Game Management** - Make moves, resign, abort games
✅ **User Profiles** - Display Lichess username and rating

## Architecture

### Backend Services

1. **OAuth Service** (`src/lib/lichess-oauth.ts`)
   - PKCE code generation
   - Authorization URL building
   - Token exchange
   - User profile retrieval

2. **Board API Service** (`src/lib/lichess-board.ts`)
   - Event streaming
   - Game state streaming
   - Move execution
   - Challenge management
   - Game actions (resign, abort, etc.)

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/lichess/auth` | GET | Initiate OAuth flow |
| `/api/lichess/callback` | GET | OAuth callback handler |
| `/api/lichess/seek` | POST | Create matchmaking request |
| `/api/lichess/current-games` | GET | Get ongoing games |
| `/api/lichess/game/[id]/state` | GET | Get game state |
| `/api/lichess/game/[id]/move` | POST | Make a move |
| `/api/lichess/game/[id]/resign` | POST | Resign from game |

### Frontend Components

1. **React Hook** (`src/hooks/useLichessGame.ts`)
   - Authentication state management
   - Game state management
   - Action handlers
   - Real-time polling

2. **UI Component** (`src/sections/play/lichessLivePlay.tsx`)
   - Authentication flow
   - Game setup interface
   - Time control selection
   - Game status display

## Setup Instructions

### 1. Environment Variables

No API keys needed! Lichess OAuth works with public clients (no client secret required).

Optional: Set your app URL in `.env.local`:
```env
NEXT_PUBLIC_APP_URL=https://chessmasti.com
```

### 2. Add Component to Play Page

Add the Lichess Live Play component to your play page:

```tsx
import LichessLivePlay from '@/sections/play/lichessLivePlay';

export default function PlayPage() {
  return (
    <div>
      {/* Existing play components */}

      {/* Add Lichess Live Play */}
      <LichessLivePlay />
    </div>
  );
}
```

### 3. User Flow

1. **Connect Account**
   - User clicks "Connect with Lichess"
   - Redirected to Lichess OAuth
   - Grants permissions
   - Redirected back to ChessMasti

2. **Start Game**
   - Select time control (e.g., "5+3 Blitz")
   - Choose rated/unrated
   - Click "Find Opponent"
   - Wait for matchmaking

3. **Play Game**
   - Game starts automatically
   - Opens in new tab on Lichess
   - Can make moves via API
   - Real-time state updates

4. **Post-Game**
   - Game analysis via ChessMasti AI
   - Mistake detection
   - Improvement suggestions

## OAuth Scopes

The integration requests these Lichess permissions:

- `board:play` - Play games with Board API (required)
- `challenge:read` - Read incoming challenges
- `challenge:write` - Create and accept challenges
- `preference:read` - Read user preferences
- `email:read` - Read email (for user identification)

## Security Features

✅ **PKCE (RFC 7636)** - Prevents authorization code interception
✅ **State Parameter** - CSRF protection
✅ **HTTP-only Cookies** - Prevents XSS attacks
✅ **Secure Cookies** - HTTPS-only in production
✅ **No Client Secret** - Public client, no secrets exposed

## Real-time Updates

Currently using **polling** for simplicity. For production, consider implementing:

### Option 1: Server-Sent Events (SSE)
```typescript
// API Route: /api/lichess/stream/events
export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      for await (const event of streamEvents(accessToken)) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
```

### Option 2: WebSockets
Use a WebSocket server to proxy Lichess events to clients.

## Advanced Features (TODO)

- [ ] **Embedded Board** - Play directly on ChessMasti without opening Lichess
- [ ] **Real-time Analysis** - Live evaluation during games
- [ ] **Opening Explorer** - Show opening database during game
- [ ] **Post-game Import** - Auto-import finished games for analysis
- [ ] **Tournament Support** - Join Lichess tournaments
- [ ] **Chess960 & Variants** - Support for chess variants
- [ ] **Study Integration** - Import/export Lichess studies

## API Rate Limits

Lichess API limits:
- **Authenticated requests**: No strict limit, but be reasonable
- **Board API**: Max 8 concurrent game streams per IP
- **Best practice**: Cache responses, use polling intervals ≥1 second

## Troubleshooting

### "Not authenticated" error
- Check cookies are enabled
- Verify `lichess_access_token` cookie exists
- Token may have expired - reconnect account

### Games not starting
- Ensure user has stable internet
- Check Lichess status page
- Verify Board API is enabled on user's account

### Moves not registering
- Validate UCI format (e.g., "e2e4", not "e4")
- Check it's user's turn
- Game may have ended

## Testing

Test the integration locally:

```bash
npm run dev
# Navigate to http://localhost:3000/play
# Click "Connect with Lichess"
# Complete OAuth flow
# Try creating a seek
```

## Resources

- [Lichess API Docs](https://lichess.org/api)
- [Board API Specification](https://lichess.org/api#tag/Board)
- [OAuth Documentation](https://github.com/lichess-org/api/blob/master/example/README.md)
- [TakeTakeTake Partnership Announcement](https://taketaketake.com/blog/lichess-partnership)

## Contributing

To improve the integration:

1. **Add SSE support** for real-time updates
2. **Implement embedded board** for in-app play
3. **Add tournament features**
4. **Improve error handling**
5. **Add comprehensive tests**

## License

This integration is part of ChessMasti and follows the same license (CC-BY-NC-4.0).

---

**Note**: This integration uses Lichess's public API. No partnership or affiliation with Lichess is implied. Lichess is a free, open-source chess platform - please support them at [lichess.org](https://lichess.org).
