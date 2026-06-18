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

export async function GET(request) {
  try {
    const statusesParam = request.nextUrl.searchParams.get('statuses');
    const statuses = (statusesParam || 'pending')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from('trips')
      .select('id, passenger_name, passenger_phone, destination_address, destination_lat, destination_lng, created_at, status, notes')
      .in('status', statuses)
      .not('destination_lat', 'is', null)
      .not('destination_lng', 'is', null)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: error.code || null,
            message: error.message || 'Supabase query failed',
            details: error.details || null,
            hint: error.hint || null,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: data || [] });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'SERVER_ERROR',
          message: err?.message || 'Unexpected server error',
        },
      },
      { status: 500 }
    );
  }
}
