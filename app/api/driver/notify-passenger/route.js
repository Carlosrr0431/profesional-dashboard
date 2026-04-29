import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const WASENDER_API_KEY = process.env.WASENDER_API_KEY || '';
const WASENDER_BASE_URL = process.env.WASENDER_BASE_URL || 'https://www.wasenderapi.com/api';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) throw new Error('Missing Supabase env vars');
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

export async function POST(request) {
  try {
    // Validate driver session via Authorization: Bearer <supabase_jwt>
    const authHeader = request.headers.get('authorization') || '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
    if (!jwt) {
      return NextResponse.json({ ok: false, error: 'No autenticado' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin();
    const { data: userData, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !userData?.user) {
      return NextResponse.json({ ok: false, error: 'Token inválido' }, { status: 401 });
    }

    const body = await request.json();
    const rawPhone = String(body?.phone || '').trim();
    const message = String(body?.message || '').trim();

    if (!rawPhone || !message) {
      return NextResponse.json({ ok: false, error: 'phone y message son requeridos' }, { status: 400 });
    }

    const phone = normalizePhone(rawPhone);
    if (phone.length < 10) {
      return NextResponse.json({ ok: false, error: 'Número de teléfono inválido' }, { status: 400 });
    }

    if (!WASENDER_API_KEY) {
      return NextResponse.json({ ok: false, error: 'WaSender no configurado' }, { status: 503 });
    }

    const to = `${phone}@s.whatsapp.net`;
    const resp = await fetch(`${WASENDER_BASE_URL}/send-message`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WASENDER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ to, text: message }),
    });

    if (!resp.ok) {
      const errBody = await resp.text();
      return NextResponse.json(
        { ok: false, error: `WaSender error: ${errBody.slice(0, 200)}` },
        { status: 502 }
      );
    }

    const payload = await resp.json();
    return NextResponse.json({ ok: true, msgId: payload?.data?.msgId || null });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Error interno' },
      { status: 500 }
    );
  }
}
