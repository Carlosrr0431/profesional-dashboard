import { NextResponse } from 'next/server';
import { requireAdminUser } from '../../../src/lib/adminAuthServer';
import {
  APPLICANT_BUCKET,
  APPLICANT_DOC_STEPS,
} from '../../../src/lib/driverApplicants';
import { getSupabaseAdmin } from '../../../src/lib/supabaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function groupDocuments(rows) {
  const grouped = {};
  for (const step of APPLICANT_DOC_STEPS) grouped[step.key] = [];
  for (const row of rows || []) {
    if (!grouped[row.doc_key]) grouped[row.doc_key] = [];
    grouped[row.doc_key].push(row);
  }
  return grouped;
}

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, message: auth.error }, { status: auth.status });
  }

  const supabase = getSupabaseAdmin();
  const { data: applicants, error } = await supabase
    .from('driver_applicants')
    .select('id, phone, first_name, last_name, email, dni, vehicle_kind, vehicle_year, vehicle_cc, status, submitted_at, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    return NextResponse.json({ ok: false, message: 'No pudimos leer los aspirantes.' }, { status: 500 });
  }

  const ids = (applicants || []).map((row) => row.id);
  let documents = [];
  let notifications = [];
  if (ids.length > 0) {
    const [docsRes, notesRes] = await Promise.all([
      supabase
        .from('driver_applicant_documents')
        .select('id, applicant_id, doc_key, storage_path, file_name')
        .in('applicant_id', ids),
      supabase
        .from('driver_applicant_notifications')
        .select('id, applicant_id, message, read_at, created_at')
        .in('applicant_id', ids)
        .order('created_at', { ascending: false }),
    ]);
    if (docsRes.error || notesRes.error) {
      return NextResponse.json({ ok: false, message: 'No pudimos leer la documentación.' }, { status: 500 });
    }
    documents = docsRes.data || [];
    notifications = notesRes.data || [];
  }

  const signed = await Promise.all(documents.map(async (row) => {
    const { data } = await supabase.storage
      .from(APPLICANT_BUCKET)
      .createSignedUrl(row.storage_path, 60 * 60);
    return { ...row, url: data?.signedUrl || null };
  }));

  const docsByApplicant = {};
  for (const row of signed) {
    if (!docsByApplicant[row.applicant_id]) docsByApplicant[row.applicant_id] = [];
    docsByApplicant[row.applicant_id].push(row);
  }
  const notesByApplicant = {};
  for (const row of notifications) {
    if (!notesByApplicant[row.applicant_id]) notesByApplicant[row.applicant_id] = [];
    notesByApplicant[row.applicant_id].push(row);
  }

  const unread = notifications
    .filter((row) => !row.read_at)
    .map((row) => ({
      id: row.id,
      applicantId: row.applicant_id,
      message: row.message,
      createdAt: row.created_at,
    }));

  return NextResponse.json({
    ok: true,
    steps: APPLICANT_DOC_STEPS,
    unread,
    applicants: (applicants || []).map((row) => ({
      id: row.id,
      phone: row.phone,
      firstName: row.first_name || '',
      lastName: row.last_name || '',
      email: row.email || '',
      dni: row.dni || '',
      vehicleKind: row.vehicle_kind,
      vehicleYear: row.vehicle_year,
      vehicleCc: row.vehicle_cc,
      status: row.status,
      submittedAt: row.submitted_at,
      createdAt: row.created_at,
      documents: groupDocuments(docsByApplicant[row.id] || []),
      unread: (notesByApplicant[row.id] || []).some((note) => !note.read_at),
    })),
  });
}

export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, message: auth.error }, { status: auth.status });
  }
  const payload = await request.json().catch(() => null);
  const id = String(payload?.notificationId || '').trim();
  if (!id) {
    return NextResponse.json({ ok: false, message: 'Falta la notificación.' }, { status: 400 });
  }
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from('driver_applicant_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .is('read_at', null);
  if (error) {
    return NextResponse.json({ ok: false, message: 'No pudimos marcar la notificación.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
