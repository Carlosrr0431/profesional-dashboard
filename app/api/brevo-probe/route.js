import { NextResponse } from 'next/server';
import { sendBrevoEmail } from '../../../src/lib/brevoMail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TEST_TO = 'carlos.facundo.rr@gmail.com';

export async function POST(req) {
  const secret = String(process.env.BREVO_PROBE_TOKEN || '').trim();
  const header = String(req.headers.get('x-probe-token') || '');
  if (!secret || header !== secret) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const result = await sendBrevoEmail({
    to: TEST_TO,
    subject: 'Prueba de Profesional Viajes',
    text: 'Este correo confirma que cuentas@profesionalviajes.com.ar ya envía desde el panel.',
  });

  return NextResponse.json({
    ok: Boolean(result.ok),
    detail: result.detail || null,
  }, { status: result.ok ? 200 : (result.status || 502) });
}
