import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function PATCH(request, { params }) {
  try {
    const resolvedParams = await params;
    const driverId = resolvedParams?.driverId;
    if (!driverId) {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'driverId is required' } },
        { status: 400 }
      );
    }

    const updates = await request.json();
    if (!updates || typeof updates !== 'object') {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'updates payload is required' } },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('drivers')
      .update(updates)
      .eq('id', driverId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: err?.code || 'SERVER_ERROR',
          message: err?.message || 'Unexpected server error',
          details: err?.details || null,
          hint: err?.hint || null,
        },
      },
      { status: 500 }
    );
  }
}
