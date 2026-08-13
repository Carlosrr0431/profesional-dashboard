import { NextResponse } from 'next/server';
import { requireAdminUser } from '../../../../src/lib/adminAuthServer';
import {
  connectWasenderSession,
  fetchWasenderQrCode,
  getWasenderSessionSnapshot,
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
 *  - connect (default): inicia vinculación QR vía whatsmeow
 *  - refresh-qr: pide un QR fresco
 *  - refresh-passkey: no disponible (whatsmeow solo QR)
 */
export async function POST(request) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return NextResponse.json({ ok: false, error: auth.error || 'No autorizado' }, { status: auth.status || 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || 'connect').trim().toLowerCase();

    if (action === 'refresh-passkey' || body?.linkMethod === 'passkey') {
      return NextResponse.json(
        { ok: false, error: 'Passkey no está disponible con whatsmeow. Usá vinculación por QR.' },
        { status: 400 }
      );
    }

    if (action === 'refresh-qr') {
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

    const current = await getWasenderSessionSnapshot({ refreshLive: true });
    if (current.connected && !body?.force) {
      return NextResponse.json({
        ok: true,
        ...current,
        alreadyConnected: true,
      });
    }

    const result = await connectWasenderSession({ linkMethod: 'qr' });
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
    }

    const snapshot = await getWasenderSessionSnapshot({ refreshLive: true });
    return NextResponse.json({
      ok: true,
      ...snapshot,
      qr: result.qr || snapshot.qr,
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

