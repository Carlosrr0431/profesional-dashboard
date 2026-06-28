import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../src/lib/supabaseAdmin';
import { registerCommissionPayment } from '../../../../src/lib/commissionPaymentRegister';

export async function POST(request) {
  try {
    const body = await request.json();
    const driverId = body?.driverId;
    const amount = Number(body?.amount || 0);
    const notes = body?.notes || null;

    if (!driverId || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'driverId and positive amount are required' } },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();
    const result = await registerCommissionPayment(supabase, {
      driverId,
      amount,
      paymentSource: 'dashboard',
      notes,
    });

    return NextResponse.json({
      ok: true,
      data: {
        pending_commission: result.pending_commission ?? 0,
        duplicated: result.duplicated || false,
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
      { status: 500 },
    );
  }
}
