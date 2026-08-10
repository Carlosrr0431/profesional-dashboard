/**
 * /api/whatsapp/lines
 *
 * GET  → estado en vivo de todas las líneas configuradas.
 * POST → conectar o refrescar QR de una línea específica.
 *
 * Body POST: { action: 'connect'|'refresh-qr', agentCode: string }
 * Si agentCode está vacío usa la primera línea.
 */
import { NextResponse } from 'next/server';
import { requireAdminUser } from '../../../../src/lib/adminAuthServer';
import { listWhatsmeowLines } from '../../../../src/lib/whatsmeowLines';
import {
  fetchWhatsmeowStatus,
  fetchWhatsmeowQr,
  connectWhatsmeowSession,
  disconnectWhatsmeowSession,
  configureWhatsmeowWebhook,
} from '../../../../src/lib/whatsmeowClient';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function resolveWebhookUrl(phone, agentCode) {
  const base = (
    process.env.TRACKING_BASE_URL
    || process.env.NEXT_PUBLIC_APP_URL
    || 'https://www.profesionalviajes.com.ar'
  ).replace(/\/$/, '');
  const slug = String(phone || agentCode || '').replace(/\D/g, '') || encodeURIComponent(agentCode);
  return `${base}/api/Agente_IA/${slug}`;
}

function normalizeStatus(raw) {
  const v = String(raw || '').trim().toLowerCase().replace(/\s+/g, '_');
  if (!v) return 'unknown';
  if (v === 'needscan' || v === 'qr' || v === 'waiting_qr') return 'need_scan';
  if (v === 'loggedout') return 'logged_out';
  return v;
}

const DISCONNECTED_STATUSES = new Set([
  'need_scan', 'connecting', 'disconnected', 'logged_out', 'expired', 'unknown',
]);

async function getLineSnapshot(line) {
  const webhookUrl = resolveWebhookUrl(line.phone, line.agentCode);
  try {
    const statusData = await fetchWhatsmeowStatus(line.agentCode);
    const rawConnected = Boolean(statusData?.connected);
    const status = normalizeStatus(rawConnected ? 'connected' : (statusData?.status || 'unknown'));
    let qr = null;
    if (!rawConnected && DISCONNECTED_STATUSES.has(status)) {
      qr = await fetchWhatsmeowQr(line.agentCode).catch(() => null);
    }
    return {
      agentCode: line.agentCode,
      phone: line.phone,
      label: line.label,
      index: line.index,
      webhookUrl,
      status,
      connected: rawConnected,
      qr,
    };
  } catch (err) {
    return {
      agentCode: line.agentCode,
      phone: line.phone,
      label: line.label,
      index: line.index,
      webhookUrl,
      status: 'unknown',
      connected: false,
      qr: null,
      error: err?.message || 'status_error',
    };
  }
}

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return NextResponse.json(
      { ok: false, error: auth.error || 'No autorizado' },
      { status: auth.status || 401 }
    );
  }

  const lines = listWhatsmeowLines();
  if (!lines.length) {
    return NextResponse.json({
      ok: false,
      error: 'No hay líneas WhatsApp configuradas. Revisá las variables de entorno.',
      lines: [],
    });
  }

  const snapshots = await Promise.all(lines.map(getLineSnapshot));
  return NextResponse.json({ ok: true, lines: snapshots });
}

export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return NextResponse.json(
      { ok: false, error: auth.error || 'No autorizado' },
      { status: auth.status || 401 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || 'connect').trim().toLowerCase();
  const agentCodeParam = String(body?.agentCode || '').trim();

  const lines = listWhatsmeowLines();
  const line = agentCodeParam
    ? lines.find((l) => l.agentCode.toLowerCase() === agentCodeParam.toLowerCase())
    : lines[0];

  if (!line) {
    return NextResponse.json({ ok: false, error: 'Línea no encontrada' }, { status: 404 });
  }

  const webhookUrl = resolveWebhookUrl(line.phone, line.agentCode);
  const secret = process.env.WHATSMEOW_WEBHOOK_SECRET || '';

  try {
    // refresh-qr: fuerza regeneración (disconnect → connect → poll)
    // connect: inicia/reconecta sesión y espera QR
    const forceNewQr = action === 'refresh-qr';

    if (forceNewQr) {
      // Cierra el websocket/QR viejo para que Connect genere uno nuevo
      await disconnectWhatsmeowSession(line.agentCode).catch(() => null);
      // Breve pausa para que whatsmeow libere el cliente
      await new Promise((r) => setTimeout(r, 400));
    }

    await configureWhatsmeowWebhook(line.agentCode, webhookUrl, secret);
    const connectResult = await connectWhatsmeowSession(line.agentCode, webhookUrl);
    if (!connectResult.ok && connectResult.data?.success === false) {
      return NextResponse.json(
        { ok: false, error: connectResult.data?.message || 'connect_failed' },
        { status: 400 }
      );
    }

    // Esperar QR nuevo (12 intentos × 700ms ≈ 8s)
    let qr = null;
    for (let i = 0; i < 12; i += 1) {
      qr = await fetchWhatsmeowQr(line.agentCode);
      if (qr) break;
      await new Promise((r) => setTimeout(r, 700));
    }

    if (forceNewQr && !qr) {
      return NextResponse.json(
        { ok: false, error: 'No se pudo regenerar el QR. Intentá de nuevo.' },
        { status: 400 }
      );
    }

    const snapshot = await getLineSnapshot(line);
    return NextResponse.json({ ok: true, ...snapshot, qr: qr || snapshot.qr });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Error interno' },
      { status: 500 }
    );
  }
}
