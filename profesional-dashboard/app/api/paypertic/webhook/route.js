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

  const { error: insertError } = await supabase.from('commission_payments').insert({
    driver_id,
    amount,
    notes: `Pago online via Paypertic - ID: ${paypertic_id}`,
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

  console.log('[paypertic/webhook] Proceso completado OK para driver_id:', driver_id, '| monto:', amount);
  return NextResponse.json({ received: true });
}
