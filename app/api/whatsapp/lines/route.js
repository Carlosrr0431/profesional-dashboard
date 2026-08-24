/**
 * /api/whatsapp/lines
 *
 * GET  → estado en vivo de todas las líneas configuradas.
 * POST → conectar, refrescar QR o reiniciar (logout) una/todas las líneas.
 *
 * Body POST: { action: 'connect'|'refresh-qr'|'reset'|'reset-all', agentCode?: string }
 * Si agentCode está vacío usa la primera línea (excepto reset-all).
 */
import { NextResponse } from 'next/server';
import { requireAdminUser } from '../../../../src/lib/adminAuthServer';
import { listWhatsmeowLines } from '../../../../src/lib/whatsmeowLines';
import {
  fetchWhatsmeowStatus,
  fetchWhatsmeowQr,
  connectWhatsmeowSession,
  disconnectWhatsmeowSession,
  logoutWhatsmeowSession,
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

function isStatusConnected(statusData) {
  if (!statusData || typeof statusData !== 'object') return false;
  if (statusData.connected === true) return true;
  return normalizeStatus(statusData.status) === 'connected';
}

const DISCONNECTED_STATUSES = new Set([
  'need_scan', 'connecting', 'disconnected', 'logged_out', 'expired', 'unknown',
]);

async function ensureLineWebhook(line) {
  const webhookUrl = resolveWebhookUrl(line.phone, line.agentCode);
  const secret = process.env.WHATSMEOW_WEBHOOK_SECRET || '';
  try {
    await configureWhatsmeowWebhook(line.agentCode, webhookUrl, secret);
  } catch {
    // no bloquear el listado si whatsmeow no responde
  }
}

async function getLineSnapshot(line, { includeQr = false, ensureWebhook = false } = {}) {
  const webhookUrl = resolveWebhookUrl(line.phone, line.agentCode);
  try {
    const statusData = await fetchWhatsmeowStatus(line.agentCode);
    const rawConnected = isStatusConnected(statusData);
    let status = normalizeStatus(rawConnected ? 'connected' : (statusData?.status || 'disconnected'));
    // En listado no pedimos QR: evita quedar en "Esperando QR" por un intento a medias.
    let qr = null;
    if (includeQr && !rawConnected && DISCONNECTED_STATUSES.has(status)) {
      qr = await fetchWhatsmeowQr(line.agentCode).catch(() => null);
    }
    // Si no hay QR activo, need_scan/unknown se muestran como desconectado limpio.
    if (!rawConnected && !qr && (status === 'need_scan' || status === 'unknown' || status === 'connecting')) {
      status = 'disconnected';
    }
    if (ensureWebhook) {
      const current = String(statusData?.webhook_url || '').replace(/\/+$/, '');
      if (!current || current !== webhookUrl.replace(/\/+$/, '')) {
        await ensureLineWebhook(line);
      }
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
      status: 'disconnected',
      connected: false,
      qr: null,
      error: err?.message || 'status_error',
    };
  }
}

/** Cierra sesión WhatsApp (logout) + desconecta websocket. Deja la línea lista para QR nuevo. */
async function resetLineSession(line) {
  const logoutResult = await logoutWhatsmeowSession(line.agentCode).catch((err) => ({
    ok: false,
    data: { success: false, message: err?.message || 'logout_failed' },
  }));
  await new Promise((r) => setTimeout(r, 350));
  await disconnectWhatsmeowSession(line.agentCode).catch(() => null);
  await new Promise((r) => setTimeout(r, 250));
  const snapshot = await getLineSnapshot(line, { includeQr: false });
  return {
    ok: true,
    ...snapshot,
    status: snapshot.connected ? snapshot.status : 'disconnected',
    reset: true,
    logoutOk: Boolean(logoutResult?.ok || logoutResult?.data?.success !== false),
  };
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

  const snapshots = await Promise.all(
    lines.map((line) => getLineSnapshot(line, { ensureWebhook: true }))
  );
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
  if (!lines.length) {
    return NextResponse.json({ ok: false, error: 'No hay líneas configuradas' }, { status: 404 });
  }

  try {
    if (action === 'reset-all') {
      const results = [];
      for (const line of lines) {
        results.push(await resetLineSession(line));
      }
      return NextResponse.json({
        ok: true,
        resetAll: true,
        lines: results,
      });
    }

    const line = agentCodeParam
      ? lines.find((l) => l.agentCode.toLowerCase() === agentCodeParam.toLowerCase())
      : lines[0];

    if (!line) {
      return NextResponse.json({ ok: false, error: 'Línea no encontrada' }, { status: 404 });
    }

    if (action === 'reset' || action === 'logout' || action === 'disconnect') {
      const result = await resetLineSession(line);
      return NextResponse.json(result);
    }

    const webhookUrl = resolveWebhookUrl(line.phone, line.agentCode);
    const secret = process.env.WHATSMEOW_WEBHOOK_SECRET || '';

    const live = await getLineSnapshot(line, { includeQr: false });
    if (live.connected && action !== 'reset' && action !== 'logout' && action !== 'disconnect') {
      return NextResponse.json({
        ok: true,
        ...live,
        alreadyConnected: true,
      });
    }

    const forceNewQr = action === 'refresh-qr';

    if (forceNewQr) {
      await disconnectWhatsmeowSession(line.agentCode).catch(() => null);
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

    const snapshot = await getLineSnapshot(line, { includeQr: Boolean(qr) });
    return NextResponse.json({ ok: true, ...snapshot, qr: qr || snapshot.qr });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Error interno' },
      { status: 500 }
    );
  }
}
