import { NextResponse } from 'next/server';
import {
  isDriverApplicantClient,
  requireApplicant,
  validateApplicantProfile,
} from '../../../../../../src/lib/driverApplicants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req) {
  try {
    const payload = await req.json().catch(() => null);
    if (!isDriverApplicantClient(req, payload)) {
      return NextResponse.json({ ok: false, message: 'Cliente no autorizado.' }, { status: 403 });
    }
    const auth = await requireApplicant(payload?.token);
    if (!auth.ok) {
      return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status || 401 });
    }
    if (auth.applicant.status === 'submitted') {
      return NextResponse.json(
        { ok: false, message: 'La documentación ya fue enviada.' },
        { status: 409 },
      );
    }

    const profile = validateApplicantProfile(payload || {});
    if (!profile.ok) {
      return NextResponse.json({ ok: false, message: profile.message }, { status: 400 });
    }

    const { error } = await auth.supabase
      .from('driver_applicants')
      .update({
        first_name: profile.name,
        last_name: profile.surname,
        email: profile.mail,
        dni: profile.document,
        status: 'profile',
        updated_at: new Date().toISOString(),
      })
      .eq('id', auth.applicant.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[driver-applicant/profile]', error);
    return NextResponse.json(
      { ok: false, message: 'No pudimos guardar tus datos.' },
      { status: 500 },
    );
  }
}
