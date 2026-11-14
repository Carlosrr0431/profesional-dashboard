import { NextResponse } from 'next/server';
import {
  APPLICANT_BUCKET,
  isDriverApplicantClient,
  requireApplicant,
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

    const fileId = String(payload?.fileId || '').trim();
    if (!fileId) {
      return NextResponse.json({ ok: false, message: 'No encontramos ese archivo.' }, { status: 400 });
    }

    const { data: row, error: readError } = await auth.supabase
      .from('driver_applicant_documents')
      .select('id, storage_path')
      .eq('id', fileId)
      .eq('applicant_id', auth.applicant.id)
      .maybeSingle();
    if (readError) throw readError;
    if (!row) {
      return NextResponse.json({ ok: false, message: 'No encontramos ese archivo.' }, { status: 404 });
    }

    await auth.supabase.storage.from(APPLICANT_BUCKET).remove([row.storage_path]);
    const { error } = await auth.supabase
      .from('driver_applicant_documents')
      .delete()
      .eq('id', row.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[driver-applicant/remove-file]', error);
    return NextResponse.json(
      { ok: false, message: 'No pudimos quitar el archivo.' },
      { status: 500 },
    );
  }
}
