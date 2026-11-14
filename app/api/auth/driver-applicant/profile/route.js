import { NextResponse } from 'next/server';
import {
  applicantDraftPatch,
  findRegisteredDriverByEmail,
  findRegisteredDriverByPhone,
  isDriverApplicantClient,
  requireApplicant,
  validateApplicantProfile,
} from '../../../../../src/lib/driverApplicants';

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

    if (payload?.draft) {
      const patch = applicantDraftPatch(payload, auth.applicant);
      if (Object.keys(patch).length === 0) return NextResponse.json({ ok: true });
      if (patch.phone) {
        const taken = await findRegisteredDriverByPhone(patch.phone);
        if (taken) {
          return NextResponse.json(
            { ok: false, message: 'Ese teléfono ya es chofer. Ingresá con tu cuenta.' },
            { status: 409 },
          );
        }
      }
      if (patch.email) {
        const takenMail = await findRegisteredDriverByEmail(patch.email);
        if (takenMail) {
          return NextResponse.json(
            { ok: false, message: 'Ese correo ya es chofer. Ingresá con tu cuenta.' },
            { status: 409 },
          );
        }
      }
      const personal = ['first_name', 'last_name', 'email', 'phone', 'dni'].some((key) => key in patch);
      const { error } = await auth.supabase
        .from('driver_applicants')
        .update({
          ...patch,
          status: auth.applicant.status === 'phone_verified' && personal ? 'profile' : auth.applicant.status,
          updated_at: new Date().toISOString(),
        })
        .eq('id', auth.applicant.id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    const profile = validateApplicantProfile(payload || {}, auth.applicant);
    if (!profile.ok) {
      return NextResponse.json({ ok: false, message: profile.message }, { status: 400 });
    }
    if (!auth.applicant.phone) {
      const taken = await findRegisteredDriverByPhone(profile.phone);
      if (taken) {
        return NextResponse.json(
          { ok: false, message: 'Ese teléfono ya es chofer. Ingresá con tu cuenta.' },
          { status: 409 },
        );
      }
    }
    if (!auth.applicant.email) {
      const takenMail = await findRegisteredDriverByEmail(profile.mail);
      if (takenMail) {
        return NextResponse.json(
          { ok: false, message: 'Ese correo ya es chofer. Ingresá con tu cuenta.' },
          { status: 409 },
        );
      }
    }

    const { error } = await auth.supabase
      .from('driver_applicants')
      .update({
        first_name: profile.name,
        last_name: profile.surname,
        email: profile.mail,
        phone: profile.phone,
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
