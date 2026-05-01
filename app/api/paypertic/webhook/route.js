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
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo inválido' }, { status: 400 });
  }

  const { status, final_amount, metadata, id: paypertic_id } = body;

  // Solo procesar pagos aprobados
  if (status !== 'paid') {
    return NextResponse.json({ received: true });
  }

  const driver_id = metadata?.driver_id;
  if (!driver_id) {
    console.error('Webhook Paypertic: falta driver_id en metadata', body);
    return NextResponse.json({ error: 'driver_id no encontrado en metadata' }, { status: 400 });
  }

  const amount = Number(final_amount);
  if (!amount || amount <= 0) {
    console.error('Webhook Paypertic: final_amount inválido', body);
    return NextResponse.json({ error: 'Monto inválido' }, { status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { error } = await supabase.from('commission_payments').insert({
    driver_id,
    amount,
    notes: `Pago online via Paypertic - ID: ${paypertic_id}`,
  });

  if (error) {
    console.error('Error al registrar pago de comisión:', error);
    return NextResponse.json({ error: 'Error interno al registrar el pago' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
