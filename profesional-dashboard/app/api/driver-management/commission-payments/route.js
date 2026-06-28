import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../src/lib/supabaseAdmin';
import {
  getCommissionPeriodBounds,
  groupPaymentsByDriver,
  resolveCommissionPeriod,
  sumPaymentAmounts,
} from '../../../../src/lib/commissionPaymentPeriods';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || 'week';
    const anchor = searchParams.get('anchor') || null;
    const driverId = searchParams.get('driverId') || null;

    if (!['week', 'month', 'all'].includes(period)) {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'period debe ser week, month o all' } },
        { status: 400 },
      );
    }

    const { startIso, endIso, label } = resolveCommissionPeriod(period, anchor);
    const supabase = getSupabaseAdmin();

    let paymentsQuery = supabase
      .from('commission_payments')
      .select('id, driver_id, amount, notes, payment_source, paypertic_id, external_transaction_id, created_at')
      .order('created_at', { ascending: false });

    if (driverId) {
      paymentsQuery = paymentsQuery.eq('driver_id', driverId);
    }
    if (startIso) {
      paymentsQuery = paymentsQuery.gte('created_at', startIso).lte('created_at', endIso);
    }

    const { data: payments, error: paymentsError } = await paymentsQuery.limit(500);
    if (paymentsError) throw paymentsError;

    const driverIds = [...new Set((payments || []).map((p) => p.driver_id).filter(Boolean))];
    let driverNameById = {};

    if (driverIds.length > 0) {
      const { data: drivers, error: driversError } = await supabase
        .from('drivers')
        .select('id, full_name, driver_number')
        .in('id', driverIds);
      if (driversError) throw driversError;
      driverNameById = Object.fromEntries(
        (drivers || []).map((d) => [d.id, d.full_name || `Chofer #${d.driver_number || '?'}`]),
      );
    }

    const enriched = (payments || []).map((p) => ({
      ...p,
      driver_name: driverNameById[p.driver_id] || 'Chofer',
    }));

    const weekBounds = getCommissionPeriodBounds('week');
    const monthBounds = getCommissionPeriodBounds('month');

    let weekQuery = supabase
      .from('commission_payments')
      .select('amount, driver_id')
      .gte('created_at', weekBounds.startIso)
      .lte('created_at', weekBounds.endIso);
    let monthQuery = supabase
      .from('commission_payments')
      .select('amount, driver_id')
      .gte('created_at', monthBounds.startIso)
      .lte('created_at', monthBounds.endIso);

    if (driverId) {
      weekQuery = weekQuery.eq('driver_id', driverId);
      monthQuery = monthQuery.eq('driver_id', driverId);
    }

    const [{ data: weekPayments }, { data: monthPayments }] = await Promise.all([
      weekQuery,
      monthQuery,
    ]);

    return NextResponse.json({
      ok: true,
      data: {
        period,
        anchor,
        periodLabel: label,
        startAt: startIso,
        endAt: endIso,
        total: sumPaymentAmounts(enriched),
        count: enriched.length,
        weekTotal: sumPaymentAmounts(weekPayments || []),
        monthTotal: sumPaymentAmounts(monthPayments || []),
        byDriver: groupPaymentsByDriver(enriched, driverNameById),
        payments: enriched,
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
        },
      },
      { status: 500 },
    );
  }
}
