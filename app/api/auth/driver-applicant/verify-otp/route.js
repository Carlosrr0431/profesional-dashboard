import { NextResponse } from 'next/server';
import { consumePassengerOtp } from '../../../../../../src/lib/passengerOtp';
import { normalizePassengerPhoneForDb } from '../../../../../../src/lib/passengerAuthPhone';
import {
  createApplicantSession,
  findRegisteredDriverByPhone,
  isDriverApplicantClient,
  upsertApplicantByPhone,
} from '../../../../../../src/lib/driverApplicants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const payload = await req.json().catch(() => null);
    if (!isDriverApplicantClient(req, payload)) {
      return NextResponse.json({ ok: false, message: 'Cliente no autorizado.' }, { status: 403 });
    }

    const phone = normalizePassengerPhoneForDb(payload?.phone);
    const consumed = await consumePassengerOtp(payload?.phone, payload?.code);
    if (!consumed.ok) {
      return NextResponse.json(
        { ok: false, message: consumed.message },
        { status: consumed.status || 400 },
      );
    }

    const already = await findRegisteredDriverByPhone(consumed.phone || phone);
    if (already) {
      return NextResponse.json(
        { ok: false, message: 'Este teléfono ya es chofer. Ingresá con tu cuenta.' },
        { status: 409 },
      );
    }

    const applicant = await upsertApplicantByPhone(consumed.phone);
    if (!applicant.ok) {
      return NextResponse.json({ ok: false, message: applicant.message }, { status: applicant.status || 400 });
    }
    const session = await createApplicantSession(applicant.applicantId);
    if (!session.ok) {
      return NextResponse.json({ ok: false, message: session.message }, { status: session.status || 400 });
    }

    return NextResponse.json({
      ok: true,
      phone: consumed.phone,
      token: session.token,
      expiresAt: session.expiresAt,
      status: applicant.status,
      alreadySubmitted: applicant.status === 'submitted',
    });
  } catch (error) {
    console.error('[driver-applicant/verify-otp]', error);
    return NextResponse.json(
      { ok: false, message: 'No pudimos verificar el código. Intentá de nuevo.' },
      { status: 500 },
    );
  }
}
