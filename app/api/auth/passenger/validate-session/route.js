import { NextResponse } from 'next/server';
import { validatePassengerSession } from '../../../../../src/lib/passengerOtp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const payload = await req.json().catch(() => null);
    const phone = String(payload?.phone || '').trim();
    const sessionToken = String(payload?.sessionToken || '').trim();

    const result = await validatePassengerSession(phone, sessionToken);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.message },
        { status: result.status || 401 }
      );
    }

    return NextResponse.json({
      ok: true,
      phone: result.phone,
      sessionToken: result.sessionToken,
      sessionExpiresAt: result.sessionExpiresAt,
      name: result.name,
    });
  } catch (error) {
    console.error('[passenger/validate-session]', error);
    return NextResponse.json(
      { ok: false, message: 'No pudimos validar tu sesión.' },
      { status: 500 }
    );
  }
}
