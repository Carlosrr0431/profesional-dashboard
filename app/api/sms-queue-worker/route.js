import { NextResponse } from 'next/server';
import { validateCronAuth } from '../../../src/lib/cronAuth';
import { processSmsOutboundBatch, processWhatsappBulkBatch } from '../../../src/lib/bulkSmsQueue';
import {
  SMS_BULK_INTERVAL_MS,
  SMS_BULK_MAX_PER_TICK,
  WHATSAPP_BULK_INTERVAL_MS,
  WHATSAPP_BULK_MAX_PER_TICK,
} from '../../../src/lib/bulkSms';
import { isSmsGatewayConfigured } from '../../../src/lib/smsGateway';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CRON_SECRET = process.env.CRON_SECRET || '';

async function handle(request) {
  const url = new URL(request.url);
  const auth = validateCronAuth({
    headers: request.headers,
    searchParams: url.searchParams,
    cronSecret: CRON_SECRET,
  });

  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: 'No autorizado' }, { status: 401 });
  }

  const claimer = `sms-worker:${auth.authMode || 'unknown'}`;
  const sms = isSmsGatewayConfigured()
    ? await processSmsOutboundBatch({
      claimer,
      maxMessages: SMS_BULK_MAX_PER_TICK,
    })
    : { processed: 0, sent: 0, skipped: 'no_gateway', results: [] };

  const whatsapp = await processWhatsappBulkBatch({
    claimer,
    maxMessages: WHATSAPP_BULK_MAX_PER_TICK,
  });

  if (sms.missingTable || whatsapp.missingTable) {
    return NextResponse.json({
      ok: false,
      error: 'Falta migrar bulk_sms_queue.sql en Supabase',
      sms,
      whatsapp,
    }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    intervalMs: SMS_BULK_INTERVAL_MS,
    whatsappIntervalMs: WHATSAPP_BULK_INTERVAL_MS,
    sms,
    whatsapp,
    sent: (sms.sent || 0) + (whatsapp.sent || 0),
    processed: (sms.processed || 0) + (whatsapp.processed || 0),
  });
}

export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}
