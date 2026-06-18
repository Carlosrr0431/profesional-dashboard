import { NextResponse } from 'next/server';
import { verifyOtpAndCreateSession } from '../../../../../src/lib/passengerOtp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const payload = await req.json().catch(() => null);
    const phone = String(payload?.phone || '').trim();
    const code = String(payload?.code || '').trim();

    if (!phone || !code) {
      return NextResponse.json(
        { ok: false, message: 'Teléfono y código son requeridos.' },
        { status: 400 }
      );
    }

    const result = await verifyOtpAndCreateSession(phone, code);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.message },
        { status: result.status || 400 }
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
    console.error('[passenger/verify-otp]', error);
    return NextResponse.json(
      { ok: false, message: 'No pudimos verificar el código. Intentá de nuevo.' },
      { status: 500 }
    );
  }
}
