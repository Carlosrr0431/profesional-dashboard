import { NextResponse } from 'next/server';
import { provisionDriverPhoneAuth } from '../../../../../src/lib/driverPhoneProvision';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const payload = await req.json().catch(() => null);
    const driverId = String(payload?.driverId || payload?.driver_id || '').trim();
    const phone = String(payload?.phone || '').trim();
    const password = String(payload?.password || '');

    if (!driverId || !phone || !password) {
      return NextResponse.json(
        { ok: false, message: 'Teléfono, chofer y contraseña son requeridos.' },
        { status: 400 },
      );
    }

    const result = await provisionDriverPhoneAuth({ driverId, phone, password });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.message },
        { status: result.status || 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      auth_email: result.auth_email,
    });
  } catch (error) {
    console.error('[driver-phone/provision]', error);
    return NextResponse.json(
      { ok: false, message: error?.message || 'No se pudo configurar la cuenta.' },
      { status: 500 },
    );
  }
}
