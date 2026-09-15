import { NextResponse } from 'next/server';
import { requireAdminUser } from '../../../../src/lib/adminAuthServer';
import { getSupabaseAdmin } from '../../../../src/lib/supabaseAdmin';
import { cancelSmsCampaign, getSmsCampaign } from '../../../../src/lib/bulkSmsQueue';

export const dynamic = 'force-dynamic';

export async function GET(request, context) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const { id } = await context.params;
  const result = await getSmsCampaign(id, { supabase: getSupabaseAdmin() });
  if (!result.ok) {
    const status = result.missingTable ? 503 : (result.status || 500);
    return NextResponse.json(result, { status });
  }
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request, context) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  if (String(body?.action || '') !== 'cancel') {
    return NextResponse.json({ ok: false, error: 'Acción no soportada' }, { status: 400 });
  }

  const { id } = await context.params;
  const result = await cancelSmsCampaign(id, { supabase: getSupabaseAdmin() });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.missingTable ? 503 : 500 });
  }
  return NextResponse.json(result);
}
