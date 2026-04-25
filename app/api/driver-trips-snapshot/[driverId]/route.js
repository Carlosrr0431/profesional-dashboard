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

export async function GET(_request, { params }) {
  try {
    const driverId = params?.driverId;
    if (!driverId) {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'driverId is required' } },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const [tripsRes, paymentsRes] = await Promise.all([
      supabase
        .from('trips')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('commission_payments')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: false }),
    ]);

    if (tripsRes.error) throw tripsRes.error;
    if (paymentsRes.error) throw paymentsRes.error;

    return NextResponse.json({
      ok: true,
      data: {
        trips: tripsRes.data || [],
        commissionPayments: paymentsRes.data || [],
      },
    });
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
