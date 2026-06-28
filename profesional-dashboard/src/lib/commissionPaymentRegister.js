/**
 * Registra un pago de comisión con idempotencia y actualiza saldo del chofer.
 * Usado por Paypertic (webhook + consulta), dashboard manual y app conductor.
 */

function buildPayperticNotes(payperticId) {
  return payperticId ? `Pago online via Paypertic - ID: ${payperticId}` : 'Pago online via Paypertic';
}

async function findExistingPayment(supabase, { driverId, payperticId, notes }) {
  if (payperticId) {
    const { data } = await supabase
      .from('commission_payments')
      .select('id')
      .eq('paypertic_id', payperticId)
      .maybeSingle();
    if (data?.id) return data;
  }

  if (notes) {
    const { data } = await supabase
      .from('commission_payments')
      .select('id')
      .eq('driver_id', driverId)
      .eq('notes', notes)
      .maybeSingle();
    if (data?.id) return data;
  }

  return null;
}

async function markAccumulationsPaid(supabase, driverId, amount) {
  const { data: pendingAccumulations, error: fetchAccumError } = await supabase
    .from('commission_accumulation_log')
    .select('id, commission_amount')
    .eq('driver_id', driverId)
    .eq('status', 'pending')
    .order('accumulated_at', { ascending: true });

  if (fetchAccumError || !Array.isArray(pendingAccumulations) || pendingAccumulations.length === 0) {
    return;
  }

  let remaining = amount;
  const idsToMarkPaid = [];
  for (const row of pendingAccumulations) {
    if (remaining <= 0) break;
    const rowAmount = Number(row?.commission_amount || 0);
    if (rowAmount <= 0) continue;
    idsToMarkPaid.push(row.id);
    remaining = Number((remaining - rowAmount).toFixed(2));
  }

  if (idsToMarkPaid.length > 0) {
    await supabase
      .from('commission_accumulation_log')
      .update({ status: 'paid' })
      .in('id', idsToMarkPaid);
  }
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {{
 *   driverId: string,
 *   amount: number,
 *   paymentSource?: 'paypertic'|'manual'|'dashboard',
 *   payperticId?: string|null,
 *   externalTransactionId?: string|null,
 *   notes?: string|null,
 *   resetPendingToZero?: boolean,
 * }} params
 */
export async function registerCommissionPayment(supabase, {
  driverId,
  amount,
  paymentSource = 'manual',
  payperticId = null,
  externalTransactionId = null,
  notes = null,
  resetPendingToZero = false,
}) {
  const normalizedAmount = Number(amount);
  if (!driverId || !Number.isFinite(normalizedAmount) || normalizedAmount <= 0) {
    throw new Error('driverId y amount positivo son requeridos');
  }

  const resolvedNotes = notes
    ?? (paymentSource === 'paypertic' ? buildPayperticNotes(payperticId) : null);

  const existing = await findExistingPayment(supabase, {
    driverId,
    payperticId,
    notes: resolvedNotes,
  });

  if (existing?.id) {
    return { duplicated: true, paymentId: existing.id, pending_commission: null };
  }

  const insertRow = {
    driver_id: driverId,
    amount: normalizedAmount,
    notes: resolvedNotes,
    payment_source: paymentSource,
    paypertic_id: payperticId || null,
    external_transaction_id: externalTransactionId || null,
  };

  const { data: inserted, error: insertError } = await supabase
    .from('commission_payments')
    .insert(insertRow)
    .select('id')
    .single();

  if (insertError) throw insertError;

  const { data: driver, error: getError } = await supabase
    .from('drivers')
    .select('pending_commission')
    .eq('id', driverId)
    .single();
  if (getError) throw getError;

  const currentPending = Number(driver?.pending_commission) || 0;
  const newBalance = resetPendingToZero
    ? 0
    : Math.max(0, Math.round((currentPending - normalizedAmount) * 100) / 100);

  const { error: updateError } = await supabase
    .from('drivers')
    .update({
      pending_commission: newBalance,
      last_commission_payment_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', driverId);

  if (updateError) throw updateError;

  await markAccumulationsPaid(supabase, driverId, normalizedAmount);

  return {
    duplicated: false,
    paymentId: inserted?.id,
    pending_commission: newBalance,
  };
}
