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
    const resolvedParams = await params;
    const driverId = resolvedParams?.driverId;
    if (!driverId) {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'driverId is required' } },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const [tripsRes, paymentsRes, driverRes] = await Promise.all([
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
      supabase
        .from('drivers')
        .select('pending_commission, last_commission_payment_at')
        .eq('id', driverId)
        .single(),
    ]);

    if (tripsRes.error) throw tripsRes.error;
    if (paymentsRes.error) throw paymentsRes.error;
    if (driverRes.error) throw driverRes.error;

    return NextResponse.json({
      ok: true,
      data: {
        trips: tripsRes.data || [],
        commissionPayments: paymentsRes.data || [],
        pendingCommission: Number(driverRes.data?.pending_commission) || 0,
        lastCommissionPaymentAt: driverRes.data?.last_commission_payment_at || null,
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
