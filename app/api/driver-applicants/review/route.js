import { NextResponse } from 'next/server';
import { requireAdminUser } from '../../../../src/lib/adminAuthServer';
import { applicantDecisionEmail, sendBrevoEmail } from '../../../../src/lib/brevoMail';
import { normalizeApplicantEmail } from '../../../../src/lib/driverApplicants';
import { getSupabaseAdmin } from '../../../../src/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DECISIONS = {
  accepted: 'accepted',
  rejected: 'rejected',
};

export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, message: auth.error }, { status: auth.status });
  }

  const payload = await request.json().catch(() => null);
  const applicantId = String(payload?.applicantId || '').trim();
  const decision = DECISIONS[payload?.decision];
  if (!applicantId || !decision) {
    return NextResponse.json({ ok: false, message: 'Falta la solicitud o la decisión.' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  const { data: applicant, error: readError } = await supabase
    .from('driver_applicants')
    .select('id, first_name, last_name, email, status')
    .eq('id', applicantId)
    .maybeSingle();
  if (readError || !applicant?.id) {
    return NextResponse.json({ ok: false, message: 'No encontramos al aspirante.' }, { status: 404 });
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('driver_applicants')
    .update({ status: decision, updated_at: now })
    .eq('id', applicantId);
  if (updateError) {
    const message = String(updateError.message || '');
    if (message.includes('driver_applicants_status_check')) {
      return NextResponse.json({
        ok: false,
        message: 'Falta actualizar los estados. Ejecutá driver_applicants_review.sql en Supabase.',
      }, { status: 503 });
    }
    return NextResponse.json({ ok: false, message: 'No pudimos guardar la decisión.' }, { status: 500 });
  }

  const mail = normalizeApplicantEmail(applicant.email);
  let emailSent = false;
  let emailMessage = '';
  if (mail) {
    const name = [applicant.first_name, applicant.last_name].filter(Boolean).join(' ');
    const letter = applicantDecisionEmail({ name, accepted: decision === 'accepted' });
    const sent = await sendBrevoEmail({ to: mail, ...letter });
    emailSent = Boolean(sent.ok);
    if (!sent.ok) emailMessage = sent.message || 'No pudimos enviar el correo.';
  } else {
    emailMessage = 'No hay un correo cargado para avisar.';
  }

  return NextResponse.json({
    ok: true,
    status: decision,
    emailSent,
    emailMessage,
  });
}
