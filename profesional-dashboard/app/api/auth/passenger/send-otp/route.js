import { NextResponse } from 'next/server';
import { createAndSendOtp } from '../../../../../src/lib/passengerOtp';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const payload = await req.json().catch(() => null);
    const phone = String(payload?.phone || '').trim();

    if (!phone) {
      return NextResponse.json(
        { ok: false, message: 'Ingresá tu número de teléfono.' },
        { status: 400 }
      );
    }

    const result = await createAndSendOtp(phone);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.message, reason: result.reason || null },
        { status: result.status || 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      phone: result.phone,
      maskedPhone: result.maskedPhone,
      expiresInSeconds: result.expiresInSeconds,
      message: 'Te enviamos un código por WhatsApp.',
    });
  } catch (error) {
    console.error('[passenger/send-otp]', error);
    return NextResponse.json(
      { ok: false, message: 'No pudimos enviar el código. Intentá de nuevo.' },
      { status: 500 }
    );
  }
}
