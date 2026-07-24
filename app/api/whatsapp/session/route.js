import { NextResponse } from 'next/server';
import { requireAdminUser } from '../../../../src/lib/adminAuthServer';
import {
  connectWasenderSession,
  fetchWasenderPasskeyToken,
  fetchWasenderQrCode,
  getWasenderSessionSnapshot,
  isReconnectStatus,
} from '../../../../src/lib/wasenderSession';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error || 'No autorizado' }, { status: auth.status || 401 });
  }

  try {
    const snapshot = await getWasenderSessionSnapshot({ refreshLive: true });
    return NextResponse.json(snapshot);
  } catch (err) {
    console.error('[whatsapp/session] GET', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Error al consultar la sesión de WhatsApp' },
      { status: 500 }
    );
  }
}

/**
 * body.action:
 *  - connect (default): inicia vinculación QR o passkey
 *  - refresh-qr: pide un QR fresco
 *  - refresh-passkey: pide token passkey fresco
 * body.linkMethod: 'qr' | 'passkey'
 */
export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error || 'No autorizado' }, { status: auth.status || 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || 'connect').trim().toLowerCase();
    const linkMethod = String(body?.linkMethod || 'qr').trim().toLowerCase() === 'passkey'
      ? 'passkey'
      : 'qr';

    if (action === 'refresh-qr') {
      // Preferir connect forzado: el endpoint /qrcode a veces devuelve un QR ya vencido.
      const connected = await connectWasenderSession({ linkMethod: 'qr' });
      if (connected.ok && connected.qr) {
        const snapshot = await getWasenderSessionSnapshot({ refreshLive: true });
        return NextResponse.json({
          ok: true,
          ...snapshot,
          qr: connected.qr,
          status: connected.status || snapshot.status,
        });
      }

      const result = await fetchWasenderQrCode();
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: connected.error || result.error },
          { status: 400 }
        );
      }
      const snapshot = await getWasenderSessionSnapshot({ refreshLive: true });
      return NextResponse.json({ ok: true, ...snapshot, qr: result.qr });
    }

    if (action === 'refresh-passkey') {
      const result = await fetchWasenderPasskeyToken();
      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }
      const snapshot = await getWasenderSessionSnapshot({ refreshLive: true });
      return NextResponse.json({ ok: true, ...snapshot, passkey: result.passkey });
    }

    // Antes de conectar, si ya está connected, no forzar salvo body.force
    const current = await getWasenderSessionSnapshot({ refreshLive: true });
    if (current.connected && !body?.force) {
      return NextResponse.json({
        ok: true,
        ...current,
        alreadyConnected: true,
      });
    }

    if (!isReconnectStatus(current.status) && current.status !== 'unknown' && current.status !== 'connecting' && !body?.force) {
      // Igual permitir connect si el operador lo pide con force; si no, informar.
    }

    const result = await connectWasenderSession({ linkMethod });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    const snapshot = await getWasenderSessionSnapshot({ refreshLive: true });
    return NextResponse.json({
      ok: true,
      ...snapshot,
      qr: result.qr || snapshot.qr,
      passkey: result.passkey || snapshot.passkey,
      sessionId: result.sessionId,
    });
  } catch (err) {
    console.error('[whatsapp/session] POST', err);
    return NextResponse.json(
      { ok: false, error: err?.message || 'Error al vincular la sesión de WhatsApp' },
      { status: 500 }
    );
  }
}
