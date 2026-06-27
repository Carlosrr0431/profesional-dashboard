import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://xzabzbrolmkezljsyycr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Paypertic envía notificaciones POST cuando cambia el estado de un pago.
// Cuando el estado es "paid", registramos el pago en commission_payments.
export async function POST(request) {
  console.log('[paypertic/webhook] POST recibido');
  let body;
  try {
    body = await request.json();
    console.log('[paypertic/webhook] Body completo:', JSON.stringify(body));
  } catch {
    console.error('[paypertic/webhook] Error al parsear body');
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  const { status, final_amount, metadata, id: paypertic_id } = body;
  console.log('[paypertic/webhook] status:', status, '| final_amount:', final_amount, '| paypertic_id:', paypertic_id, '| metadata:', JSON.stringify(metadata));

  // Solo procesar pagos aprobados (Paypertic envía "approved", no "paid")
  if (status !== 'approved' && status !== 'paid') {
    console.log('[paypertic/webhook] Estado no es approved/paid, ignorando. Estado recibido:', status);
    return NextResponse.json({ received: true });
  }

  const driver_id = metadata?.driver_id;
  if (!driver_id) {
    console.error('[paypertic/webhook] Falta driver_id en metadata. Body:', JSON.stringify(body));
    return NextResponse.json({ error: 'driver_id no encontrado en metadata' }, { status: 400 });
  }
  console.log('[paypertic/webhook] Procesando pago para driver_id:', driver_id);

  const amount = Number(final_amount);
  if (!amount || amount <= 0) {
    console.error('[paypertic/webhook] final_amount inválido:', final_amount);
    return NextResponse.json({ error: 'Monto inválido' }, { status: 400 });
  }
  console.log('[paypertic/webhook] Monto:', amount);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Idempotencia básica: si ya registramos este paypertic_id previamente,
  // evitamos duplicar inserts y side-effects.
  const paymentNote = `Pago online via Paypertic - ID: ${paypertic_id}`;
  const { data: existingPayment } = await supabase
    .from('commission_payments')
    .select('id')
    .eq('driver_id', driver_id)
    .eq('notes', paymentNote)
    .maybeSingle();

  if (existingPayment?.id) {
    console.log('[paypertic/webhook] Pago ya procesado previamente. payment_id local:', existingPayment.id);
    return NextResponse.json({ received: true, duplicated: true });
  }

  const { error: insertError } = await supabase.from('commission_payments').insert({
    driver_id,
    amount,
    notes: paymentNote,
  });

  if (insertError) {
    console.error('[paypertic/webhook] Error al insertar commission_payment:', insertError.message, insertError.details);
    return NextResponse.json({ error: 'Error interno al registrar el pago' }, { status: 500 });
  }
  console.log('[paypertic/webhook] commission_payment insertado OK para driver_id:', driver_id);

  // Poner saldo de comisión pendiente en 0
  const { error: updateError } = await supabase
    .from('drivers')
    .update({ pending_commission: 0, last_commission_payment_at: new Date().toISOString() })
    .eq('id', driver_id);

  if (updateError) {
    console.error('[paypertic/webhook] Error al resetear pending_commission:', updateError.message);
    // No devolvemos error — el pago ya quedó registrado
  } else {
    console.log('[paypertic/webhook] pending_commission reseteado a 0 para driver_id:', driver_id);
  }

  // Mantener consistencia con el flujo de pago manual:
  // marcar acumulaciones pendientes como pagadas por el monto acreditado.
  // Esto evita que paneles basados en acumulación/trips muestren deuda "fantasma".
  const { data: pendingAccumulations, error: fetchAccumError } = await supabase
    .from('commission_accumulation_log')
    .select('id, commission_amount')
    .eq('driver_id', driver_id)
    .eq('status', 'pending')
    .order('accumulated_at', { ascending: true });

  if (fetchAccumError) {
    console.error('[paypertic/webhook] Error al leer commission_accumulation_log:', fetchAccumError.message);
  } else if (Array.isArray(pendingAccumulations) && pendingAccumulations.length > 0) {
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
      const { error: markPaidError } = await supabase
        .from('commission_accumulation_log')
        .update({ status: 'paid' })
        .in('id', idsToMarkPaid);

      if (markPaidError) {
        console.error('[paypertic/webhook] Error al marcar acumulaciones como paid:', markPaidError.message);
      } else {
        console.log(
          '[paypertic/webhook] commission_accumulation_log actualizado a paid. filas:',
          idsToMarkPaid.length,
          '| remanente:',
          Math.max(0, remaining),
        );
      }
    }
  }

  console.log('[paypertic/webhook] Proceso completado OK para driver_id:', driver_id, '| monto:', amount);
  return NextResponse.json({ received: true });
}
