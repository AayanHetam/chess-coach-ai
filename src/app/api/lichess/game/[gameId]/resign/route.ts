/**
 * Lichess Game Resign Endpoint
 * Resigns from an active game
 */

import { NextRequest, NextResponse } from 'next/server';
import { resignGame } from '@/lib/lichess-board';

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

    // Resign the game
    const success = await resignGame(gameId, accessToken);

    if (!success) {
      return NextResponse.json(
        { error: 'Failed to resign. Game may have already ended.' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      gameId,
      message: 'Game resigned',
    });
  } catch (error) {
    console.error('Resign error:', error);
    return NextResponse.json(
      { error: 'Failed to resign game' },
      { status: 500 }
    );
  }
}
