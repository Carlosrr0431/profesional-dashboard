import { NextResponse } from 'next/server';
import {
  APPLICANT_DOC_STEPS,
  isDriverApplicantClient,
  missingApplicantDocs,
  requireApplicant,
  validateApplicantProfile,
  vehicleRequirementError,
} from '../../../../../../src/lib/driverApplicants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function loadDocuments(supabase, applicantId) {
  const { data, error } = await supabase
    .from('driver_applicant_documents')
    .select('id, doc_key, file_name, created_at')
    .eq('applicant_id', applicantId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  const documents = {};
  for (const step of APPLICANT_DOC_STEPS) documents[step.key] = [];
  for (const row of data || []) {
    if (!documents[row.doc_key]) documents[row.doc_key] = [];
    documents[row.doc_key].push({
      id: row.id,
      name: row.file_name || 'archivo',
    });
  }
  return documents;
}

function publicApplicant(applicant, documents) {
  const present = Object.entries(documents)
    .filter(([, files]) => files.length > 0)
    .map(([key]) => key);
  return {
    phone: applicant.phone,
    firstName: applicant.first_name || '',
    lastName: applicant.last_name || '',
    email: applicant.email || '',
    dni: applicant.dni || '',
    status: applicant.status,
    vehicleKind: applicant.vehicle_kind || '',
    vehicleYear: applicant.vehicle_year || null,
    vehicleCc: applicant.vehicle_cc || null,
    documents,
    steps: APPLICANT_DOC_STEPS,
    missingDocs: missingApplicantDocs(present),
    vehicleError: vehicleRequirementError({
      kind: applicant.vehicle_kind,
      year: applicant.vehicle_year,
      cc: applicant.vehicle_cc,
    }),
  };
}

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
    const documents = await loadDocuments(auth.supabase, auth.applicant.id);
    return NextResponse.json({ ok: true, applicant: publicApplicant(auth.applicant, documents) });
  } catch (error) {
    console.error('[driver-applicant/state]', error);
    return NextResponse.json(
      { ok: false, message: 'No pudimos recuperar la solicitud.' },
      { status: 500 },
    );
  }
}
