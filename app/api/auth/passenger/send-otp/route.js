import { NextResponse } from 'next/server';
import { createAndSendOtp } from '../../../../../src/lib/passengerOtp';
import {
  isLikelyAutomatedScannerIp,
  resolvePassengerClient,
} from '../../../../../src/lib/passengerClientGate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Rate limit simple por IP (protege abuso del endpoint público). */
const ipHits = new Map();
const IP_WINDOW_MS = 60 * 1000;
const IP_MAX_HITS = 8;
const IP_MAX_HITS_ANON = 3;

function getClientIp(req) {
  const forwarded = req.headers.get('x-forwarded-for') || '';
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

function assertIpAllowed(ip, maxHits) {
  const now = Date.now();
  const entry = ipHits.get(ip);
  if (!entry || now - entry.windowStart > IP_WINDOW_MS) {
    ipHits.set(ip, { windowStart: now, count: 1 });
    return { ok: true };
  }
  entry.count += 1;
  if (entry.count > maxHits) {
    return { ok: false };
  }
  return { ok: true };
}

export async function POST(req) {
  try {
    const payload = await req.json().catch(() => null);
    const phone = String(payload?.phone || '').trim();
    const ip = getClientIp(req);
    const userAgent = String(req.headers.get('user-agent') || '').slice(0, 180);
    const clientGate = resolvePassengerClient(req, payload);
    const client = clientGate.client || null;

    console.info('[passenger-otp]', JSON.stringify({
      stage: 'request',
      rawPhone: phone,
      ip,
      client,
      clientSource: clientGate.source,
      userAgent: userAgent || null,
    }));

    // Builds viejas de Play no mandan header: no bloquear usuarios reales.
    // Sí cortar scanners de Google sin cliente identificado.
    if (!clientGate.ok && isLikelyAutomatedScannerIp(ip)) {
      console.info('[passenger-otp]', JSON.stringify({
        stage: 'rejected_scanner',
        ip,
        client,
        userAgent: userAgent || null,
        rawPhone: phone,
      }));
      return NextResponse.json(
        { ok: false, message: 'Cliente no autorizado.' },
        { status: 403 }
      );
    }

    const ipGate = assertIpAllowed(ip, clientGate.ok ? IP_MAX_HITS : IP_MAX_HITS_ANON);
    if (!ipGate.ok) {
      console.info('[passenger-otp]', JSON.stringify({
        stage: 'rate_limited_ip',
        ip,
        client,
      }));
      return NextResponse.json(
        { ok: false, message: 'Demasiados intentos desde esta red. Esperá un minuto.' },
        { status: 429 }
      );
    }

    if (!phone) {
      return NextResponse.json(
        { ok: false, message: 'Ingresá tu número de teléfono.' },
        { status: 400 }
      );
    }

    const result = await createAndSendOtp(phone);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, message: result.message, reason: result.reason || null },
        { status: result.status || 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      phone: result.phone,
      maskedPhone: result.maskedPhone,
      expiresInSeconds: result.expiresInSeconds,
      message: 'Te enviamos un código por WhatsApp.',
    });
  } catch (error) {
    console.error('[passenger/send-otp]', error);
    return NextResponse.json(
      { ok: false, message: 'No pudimos enviar el código. Intentá de nuevo.' },
      { status: 500 }
    );
  }
}
