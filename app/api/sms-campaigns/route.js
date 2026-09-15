import { NextResponse } from 'next/server';
import { requireAdminUser } from '../../../src/lib/adminAuthServer';
import { getSupabaseAdmin } from '../../../src/lib/supabaseAdmin';
import {
  createBulkSmsCampaign,
  listSmsCampaigns,
  previewBulkSmsCampaign,
} from '../../../src/lib/bulkSmsQueue';
import { isSmsGatewayConfigured } from '../../../src/lib/smsGateway';
import { getBulkWhatsappLine } from '../../../src/lib/whatsmeowLines';
import { BULK_CHANNEL_WHATSAPP, normalizeBulkChannel } from '../../../src/lib/bulkSms';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  const result = await listSmsCampaigns({ limit: 20 }, { supabase: getSupabaseAdmin() });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.missingTable ? 503 : 500 });
  }
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Cuerpo inválido' }, { status: 400 });
  }

  const previewOnly = Boolean(body?.previewOnly);
  const payload = {
    phones: body?.phones || '',
    body: body?.body || '',
    link: body?.link || '',
    imageUrl: body?.imageUrl || body?.image_url || '',
    channel: normalizeBulkChannel(body?.channel),
    respectQuietHours: false,
  };

  try {
    const supabase = getSupabaseAdmin();
    if (previewOnly) {
      const preview = await previewBulkSmsCampaign(payload, { supabase });
      if (preview.missingTable) {
        return NextResponse.json({
          ...preview,
          gatewayConfigured: isSmsGatewayConfigured(),
          whatsappConfigured: Boolean(getBulkWhatsappLine()),
        }, { status: 503 });
      }
      return NextResponse.json({
        ...preview,
        gatewayConfigured: isSmsGatewayConfigured(),
        whatsappConfigured: Boolean(getBulkWhatsappLine()),
      });
    }

    if (payload.channel === BULK_CHANNEL_WHATSAPP && !getBulkWhatsappLine()) {
      return NextResponse.json({
        ok: false,
        error: 'No hay una línea de WhatsApp de negocio configurada para difusión.',
      }, { status: 400 });
    }

    const created = await createBulkSmsCampaign({
      ...payload,
      createdBy: auth.user.id,
      createdByEmail: auth.user.email || '',
    }, { supabase });

    if (!created.ok) {
      const status = created.missingTable ? 503 : 400;
      return NextResponse.json(created, { status });
    }
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error?.message || 'No se pudo crear la campaña' },
      { status: 500 },
    );
  }
}
