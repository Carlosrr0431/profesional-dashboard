import { NextResponse } from 'next/server';
import { provisionDriverEmailAuth } from '../../../../../src/lib/driverPhoneProvision';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const payload = await req.json().catch(() => null);
    const driverId = String(payload?.driverId || payload?.driver_id || '').trim();
    const email = String(payload?.email || payload?.login_email || '').trim();
    const password = String(payload?.password || '');

    if (!driverId || !email || !password) {
      return NextResponse.json(
        { ok: false, message: 'Correo, chofer y contraseña son requeridos.' },
        { status: 400 },
      );
    }

    const result = await provisionDriverEmailAuth({ driverId, email, password });
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.message },
        { status: result.status || 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      login_email: result.login_email,
    });
  } catch (error) {
    console.error('[driver-email/provision]', error);
    return NextResponse.json(
      { ok: false, message: error?.message || 'No se pudo configurar la cuenta de correo.' },
      { status: 500 },
    );
  }
}
