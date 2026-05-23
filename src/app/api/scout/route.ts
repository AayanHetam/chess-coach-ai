import { NextRequest, NextResponse } from 'next/server';
import { scoutSchema, validateRequest } from '@/lib/validation/schemas';
import { requireSession } from '@/lib/auth/session';
import { fetchOpponentGames } from '@/lib/server/scoutFetch';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const guard = await requireSession();
  if ("response" in guard) return guard.response;
  try {
    const body = await req.json();

    const parsed = validateRequest(scoutSchema, body);
    if (!parsed.success) return parsed.response;
    const { username, platform, months } = parsed.data;

    const payload = await fetchOpponentGames(username, platform, months);
    return NextResponse.json(payload);
  } catch (error: any) {
    console.error('Scout API error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch games' },
      { status: 500 }
    );
  }
}
