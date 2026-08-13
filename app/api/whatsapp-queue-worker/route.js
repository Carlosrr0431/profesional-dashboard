import { NextResponse } from 'next/server';
import { validateCronAuth } from '../../../src/lib/cronAuth';
import {
  processWhatsappOutboundBatch,
  WHATSAPP_OUTBOUND_INTERVAL_MS,
} from '../../../src/lib/whatsappOutboundQueue';

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

  const batch = await processWhatsappOutboundBatch({
    claimer: `queue-worker:${auth.authMode || 'unknown'}`,
    maxMessages: 8,
    deadlineMs: 55_000,
  });

  if (batch.results?.some((r) => r.missingTable)) {
    return NextResponse.json({
      ok: false,
      error: 'Falta migrar whatsapp_outbound_queue.sql en Supabase',
      intervalMs: WHATSAPP_OUTBOUND_INTERVAL_MS,
      ...batch,
    }, { status: 503 });
  }

  return NextResponse.json({
    ok: true,
    intervalMs: WHATSAPP_OUTBOUND_INTERVAL_MS,
    ...batch,
  });
}

export async function GET(request) {
  return handle(request);
}

export async function POST(request) {
  return handle(request);
}
