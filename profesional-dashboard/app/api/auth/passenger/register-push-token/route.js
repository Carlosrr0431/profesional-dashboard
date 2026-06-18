import { NextResponse } from 'next/server';
import { validatePassengerSession } from '../../../../../src/lib/passengerOtp';
import {
  syncPassengerTripPushesForPhone,
  upsertPassengerPushToken,
} from '../../../../../src/lib/passengerPushToken';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const payload = await req.json().catch(() => null);
    const phone = String(payload?.phone || '').trim();
    const sessionToken = String(payload?.sessionToken || '').trim();
    const pushToken = String(payload?.pushToken || '').trim();

    if (!phone || !sessionToken || !pushToken) {
      return NextResponse.json(
        { ok: false, message: 'Teléfono, sesión y token push son requeridos.' },
        { status: 400 }
      );
    }

    const session = await validatePassengerSession(phone, sessionToken);
    if (!session.ok) {
      return NextResponse.json(
        { ok: false, message: session.message },
        { status: session.status || 401 }
      );
    }

    const saveResult = await upsertPassengerPushToken(session.phone, pushToken);
    if (!saveResult.ok) {
      console.error('[passenger/register-push-token] save failed', saveResult);
      return NextResponse.json(
        { ok: false, message: 'No pudimos guardar el token de notificaciones.' },
        { status: 500 }
      );
    }

    const syncResult = await syncPassengerTripPushesForPhone(session.phone);

    return NextResponse.json({
      ok: true,
      phone: session.phone,
      syncedPushes: syncResult.sent || 0,
    });
  } catch (error) {
    console.error('[passenger/register-push-token]', error);
    return NextResponse.json(
      { ok: false, message: 'No pudimos registrar las notificaciones push.' },
      { status: 500 }
    );
  }
}
