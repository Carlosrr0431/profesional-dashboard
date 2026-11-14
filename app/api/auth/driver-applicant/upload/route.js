import { randomUUID } from 'crypto';
import { NextResponse } from 'next/server';
import {
  APPLICANT_BUCKET,
  applicantStorageName,
  inspectApplicantFile,
  isApplicantDocKey,
  isDriverApplicantClient,
  requireApplicant,
} from '../../../../../../src/lib/driverApplicants';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req) {
  try {
    if (!isDriverApplicantClient(req, null)) {
      return NextResponse.json({ ok: false, message: 'Cliente no autorizado.' }, { status: 403 });
    }
    const form = await req.formData();
    const auth = await requireApplicant(form.get('token'));
    if (!auth.ok) {
      return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status || 401 });
    }
    if (auth.applicant.status === 'submitted') {
      return NextResponse.json(
        { ok: false, message: 'La documentación ya fue enviada.' },
        { status: 409 },
      );
    }

    const docKey = String(form.get('docKey') || '');
    if (!isApplicantDocKey(docKey)) {
      return NextResponse.json({ ok: false, message: 'Ese documento no forma parte del alta.' }, { status: 400 });
    }

    const file = form.get('file');
    const inspected = inspectApplicantFile(file);
    if (!inspected.ok) {
      return NextResponse.json({ ok: false, message: inspected.message }, { status: 400 });
    }

    const fileName = applicantStorageName(file.name);
    const storagePath = `${auth.applicant.id}/${docKey}/${randomUUID()}-${fileName}`;
    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await auth.supabase.storage
      .from(APPLICANT_BUCKET)
      .upload(storagePath, bytes, { contentType: inspected.mime, upsert: false });
    if (uploadError) throw uploadError;

    const { data, error } = await auth.supabase
      .from('driver_applicant_documents')
      .insert({
        applicant_id: auth.applicant.id,
        doc_key: docKey,
        storage_path: storagePath,
        file_name: fileName,
        mime_type: inspected.mime,
      })
      .select('id, file_name')
      .single();
    if (error) throw error;

    if (auth.applicant.status === 'phone_verified' || auth.applicant.status === 'profile') {
      await auth.supabase
        .from('driver_applicants')
        .update({ status: 'documents', updated_at: new Date().toISOString() })
        .eq('id', auth.applicant.id);
    }

    return NextResponse.json({
      ok: true,
      file: { id: data.id, name: data.file_name || fileName },
    });
  } catch (error) {
    console.error('[driver-applicant/upload]', error);
    return NextResponse.json(
      { ok: false, message: 'No pudimos guardar la foto. Intentá de nuevo.' },
      { status: 500 },
    );
  }
}
