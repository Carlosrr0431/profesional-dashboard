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

export async function POST(request) {
  try {
    const body = await request.json();
    const driverId = body?.driverId;
    const amount = Number(body?.amount || 0);
    const notes = body?.notes || null;

    if (!driverId || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'driverId and positive amount are required' } },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { error: paymentError } = await supabase
      .from('commission_payments')
      .insert({ driver_id: driverId, amount, notes });
    if (paymentError) throw paymentError;

    const { data: driver, error: getError } = await supabase
      .from('drivers')
      .select('pending_commission')
      .eq('id', driverId)
      .single();
    if (getError) throw getError;

    const newBalance = Math.max(0, (driver?.pending_commission || 0) - amount);
    const updateFields = {
      pending_commission: newBalance,
      last_commission_payment_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const { error: updateError } = await supabase
      .from('drivers')
      .update(updateFields)
      .eq('id', driverId);
    if (updateError) throw updateError;

    const { data: pendingAccumulations, error: fetchError } = await supabase
      .from('commission_accumulation_log')
      .select('id')
      .eq('driver_id', driverId)
      .eq('status', 'pending')
      .order('accumulated_at', { ascending: true })
      .limit(Math.ceil(amount / 100));

    if (!fetchError && pendingAccumulations?.length > 0) {
      const idsToUpdate = pendingAccumulations.map((acc) => acc.id);
      await supabase
        .from('commission_accumulation_log')
        .update({ status: 'paid' })
        .in('id', idsToUpdate);
    }

    return NextResponse.json({ ok: true, data: { pending_commission: newBalance } });
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
