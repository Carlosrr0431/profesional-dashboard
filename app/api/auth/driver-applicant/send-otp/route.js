import { NextResponse } from 'next/server';
import { createAndSendOtp } from '../../../../../../src/lib/passengerOtp';
import { isLikelyAutomatedScannerIp } from '../../../../../../src/lib/passengerClientGate';
import {
  createAndSendApplicantEmailOtp,
  createApplicantSession,
  findRegisteredDriverByPhone,
  isDriverApplicantClient,
  isMissingApplicantTable,
  missingApplicantTableResponse,
  normalizeApplicantEmail,
  upsertApplicantByPhone,
} from '../../../../../../src/lib/driverApplicants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 20;

function clientIp(req) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

export async function POST(req) {
  try {
    const payload = await req.json().catch(() => null);
    if (!isDriverApplicantClient(req, payload)) {
      return NextResponse.json({ ok: false, message: 'Cliente no autorizado.' }, { status: 403 });
    }
    const email = normalizeApplicantEmail(payload?.email);
    const phone = String(payload?.phone || '').trim();
    if (!email && !phone) {
      return NextResponse.json({ ok: false, message: 'Ingresá tu teléfono o tu correo.' }, { status: 400 });
    }
    if (isLikelyAutomatedScannerIp(clientIp(req))) {
      return NextResponse.json({ ok: false, message: 'Cliente no autorizado.' }, { status: 403 });
    }

    if (email) {
      const result = await createAndSendApplicantEmailOtp(email);
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, message: result.message },
          { status: result.status || 400 },
        );
      }
      return NextResponse.json(result);
    }

    const already = await findRegisteredDriverByPhone(phone);
    if (already) {
      return NextResponse.json(
        { ok: false, message: 'Este teléfono ya es chofer. Ingresá con tu cuenta.' },
        { status: 409 },
      );
    }

    const result = await createAndSendOtp(phone);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.message, retryAfterSeconds: result.retryAfterSeconds || null },
        { status: result.status || 400 },
      );
    }

    if (result.bypass) {
      const applicant = await upsertApplicantByPhone(result.phone);
      if (!applicant.ok) {
        return NextResponse.json({ ok: false, message: applicant.message }, { status: applicant.status || 400 });
      }
      const session = await createApplicantSession(applicant.applicantId);
      if (!session.ok) {
        return NextResponse.json({ ok: false, message: session.message }, { status: session.status || 400 });
      }
      return NextResponse.json({
        ok: true,
        phone: result.phone,
        bypass: true,
        token: session.token,
        status: applicant.status,
        alreadySubmitted: applicant.status === 'submitted',
        message: 'Acceso de prueba habilitado (sin OTP).',
      });
    }

    return NextResponse.json({
      ok: true,
      phone: result.phone,
      maskedPhone: result.maskedPhone,
      expiresInSeconds: result.expiresInSeconds,
      channel: 'sms',
      message: 'Te enviamos un código por SMS.',
    });
  } catch (error) {
    if (isMissingApplicantTable(error)) {
      const missing = missingApplicantTableResponse();
      return NextResponse.json({ ok: false, message: missing.message }, { status: missing.status });
    }
    console.error('[driver-applicant/send-otp]', error);
    return NextResponse.json(
      { ok: false, message: 'No pudimos enviar el código. Intentá de nuevo.' },
      { status: 500 },
    );
  }
}
