import { NextResponse } from 'next/server';
import { getSupabaseAdmin } from '../../../../src/lib/supabaseAdmin';
import { registerCommissionPayment } from '../../../../src/lib/commissionPaymentRegister';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Paypertic envía notificaciones POST cuando cambia el estado de un pago.
// Cuando el estado es "approved"/"paid", registramos el pago en commission_payments.
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

  const { status, final_amount, metadata, id: paypertic_id, external_transaction_id } = body;
  console.log('[paypertic/webhook] status:', status, '| final_amount:', final_amount, '| paypertic_id:', paypertic_id, '| metadata:', JSON.stringify(metadata));

  if (status !== 'approved' && status !== 'paid') {
    console.log('[paypertic/webhook] Estado no es approved/paid, ignorando. Estado recibido:', status);
    return NextResponse.json({ received: true });
  }

  const driver_id = metadata?.driver_id;
  if (!driver_id) {
    console.error('[paypertic/webhook] Falta driver_id en metadata. Body:', JSON.stringify(body));
    return NextResponse.json({ error: 'driver_id no encontrado en metadata' }, { status: 400 });
  }

  const amount = Number(final_amount);
  if (!amount || amount <= 0) {
    console.error('[paypertic/webhook] final_amount inválido:', final_amount);
    return NextResponse.json({ error: 'Monto inválido' }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  try {
    const result = await registerCommissionPayment(supabase, {
      driverId: driver_id,
      amount,
      paymentSource: 'paypertic',
      payperticId: paypertic_id ? String(paypertic_id) : null,
      externalTransactionId: external_transaction_id ? String(external_transaction_id) : null,
      resetPendingToZero: true,
    });

    if (result.duplicated) {
      console.log('[paypertic/webhook] Pago ya procesado previamente. payment_id local:', result.paymentId);
      return NextResponse.json({ received: true, duplicated: true });
    }

    console.log('[paypertic/webhook] Proceso completado OK para driver_id:', driver_id, '| monto:', amount);
    return NextResponse.json({ received: true, payment_id: result.paymentId });
  } catch (err) {
    console.error('[paypertic/webhook] Error al registrar pago:', err?.message || err);
    return NextResponse.json({ error: 'Error interno al registrar el pago' }, { status: 500 });
  }
}
