import { NextResponse } from 'next/server';
import {
  isDriverApplicantClient,
  missingApplicantDocs,
  requireApplicant,
  vehicleRequirementError,
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
      return NextResponse.json({ ok: true, alreadySubmitted: true });
    }
    if (!auth.applicant.first_name || !auth.applicant.dni || !auth.applicant.phone || !auth.applicant.email) {
      return NextResponse.json(
        { ok: false, message: 'Primero completá nombre, apellido, correo, teléfono y DNI.' },
        { status: 400 },
      );
    }

    const vehicle = {
      kind: payload?.vehicleKind,
      year: Number(payload?.vehicleYear),
      cc: payload?.vehicleCc == null || payload?.vehicleCc === '' ? null : Number(payload.vehicleCc),
    };
    const vehicleError = vehicleRequirementError(vehicle);
    if (vehicleError) {
      return NextResponse.json({ ok: false, message: vehicleError }, { status: 400 });
    }

    const { data: docs, error: docsError } = await auth.supabase
      .from('driver_applicant_documents')
      .select('doc_key')
      .eq('applicant_id', auth.applicant.id);
    if (docsError) throw docsError;
    const missing = missingApplicantDocs((docs || []).map((row) => row.doc_key));
    if (missing.length > 0) {
      return NextResponse.json(
        { ok: false, message: 'Todavía faltan documentos por cargar.', missing },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const { error: updateError } = await auth.supabase
      .from('driver_applicants')
      .update({
        vehicle_kind: vehicle.kind,
        vehicle_year: vehicle.year,
        vehicle_cc: vehicle.kind === 'moto' ? vehicle.cc : null,
        status: 'submitted',
        submitted_at: now,
        updated_at: now,
      })
      .eq('id', auth.applicant.id);
    if (updateError) throw updateError;

    const fullName = `${auth.applicant.first_name} ${auth.applicant.last_name}`.trim();
    const { error: noticeError } = await auth.supabase
      .from('driver_applicant_notifications')
      .insert({
        applicant_id: auth.applicant.id,
        message: `Nuevo aspirante: ${fullName} cargó su documentación para sumarse como chofer.`,
      });
    if (noticeError) throw noticeError;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[driver-applicant/submit]', error);
    return NextResponse.json(
      { ok: false, message: 'No pudimos enviar la documentación.' },
      { status: 500 },
    );
  }
}
