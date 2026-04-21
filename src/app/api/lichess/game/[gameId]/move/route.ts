/**
 * Lichess Game Move Endpoint
 * Makes a move in an active game
 */

import { NextRequest, NextResponse } from 'next/server';
import { makeMove } from '@/lib/lichess-board';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> }
) {
  try {
    const { gameId } = await params;

    // Get access token from cookie
    const accessToken = request.cookies.get('lichess_access_token')?.value;
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    const move = body.move;

    if (!move || typeof move !== 'string') {
      return NextResponse.json(
        { error: 'Invalid move format. Expected UCI notation (e.g., "e2e4")' },
        { status: 400 }
      );
    }

    // Make the move
    const success = await makeMove(gameId, move, accessToken);

    if (!success) {
      return NextResponse.json(
        { error: 'Move rejected. It may be illegal or the game may have ended.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      gameId,
      move,
    });
  } catch (error) {
    console.error('Move error:', error);
    return NextResponse.json(
      { error: 'Failed to make move' },
      { status: 500 }
    );
  }
}
