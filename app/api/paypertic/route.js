import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAYPERTIC_AUTH_URL =
  'https://a.paypertic.com/auth/realms/entidades/protocol/openid-connect/token';
const PAYPERTIC_API_URL = 'https://api.paypertic.com/pagos';

const PAYPERTIC_USERNAME = process.env.PAYPERTIC_USERNAME;
const PAYPERTIC_PASSWORD = process.env.PAYPERTIC_PASSWORD;
const PAYPERTIC_CLIENT_ID = process.env.PAYPERTIC_CLIENT_ID;
const PAYPERTIC_CLIENT_SECRET = process.env.PAYPERTIC_CLIENT_SECRET;
const PAYPERTIC_COLLECTOR_ID = process.env.PAYPERTIC_COLLECTOR_ID || null;
const DASHBOARD_URL =
  process.env.NEXT_PUBLIC_APP_URL || 'https://profesional-dashboard.vercel.app';

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://xzabzbrolmkezljsyycr.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function getPayperticToken() {
  const body = new URLSearchParams({
    username: PAYPERTIC_USERNAME,
    password: PAYPERTIC_PASSWORD,
    grant_type: 'password',
    client_id: PAYPERTIC_CLIENT_ID,
    client_secret: PAYPERTIC_CLIENT_SECRET,
  });

  const res = await fetch(PAYPERTIC_AUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('Paypertic auth error:', res.status, text);
    throw new Error(`Error de autenticación Paypertic: ${res.status}`);
  }

  const data = await res.json();
  return data.access_token;
}

export async function POST(request) {
  // Verificar Authorization header con token de Supabase del conductor
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const userToken = authHeader.slice(7);

  // Validar token con Supabase
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(userToken);

  if (authError || !user) {
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  // Obtener datos del conductor
  const { data: driver, error: driverError } = await supabase
    .from('drivers')
    .select('id, full_name')
    .eq('user_id', user.id)
    .single();

  if (driverError || !driver) {
    return NextResponse.json({ error: 'Conductor no encontrado' }, { status: 404 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido' }, { status: 400 });
  }

  const amount = Number(body?.amount);
  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Monto inválido' }, { status: 400 });
  }

  let payperticToken;
  try {
    payperticToken = await getPayperticToken();
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  const externalTransactionId = `comision-${driver.id}-${Date.now()}`;

  // URLs de retorno — el WebView del app detecta estas URLs para cerrar el formulario
  const returnUrl = `${DASHBOARD_URL}/api/paypertic/return?status=approved&ext=${externalTransactionId}`;
  const backUrl = `${DASHBOARD_URL}/api/paypertic/return?status=back&ext=${externalTransactionId}`;

  const paymentPayload = {
    // Sin type: Paypertic devuelve form_url para que el usuario elija el medio de pago
    external_transaction_id: externalTransactionId,
    currency_id: 'ARS',
    return_url: returnUrl,
    back_url: backUrl,
    notification_url: `${DASHBOARD_URL}/api/paypertic/webhook`,
    details: [
      {
        external_reference: driver.id,
        concept_id: 'COMISION_VIAJES',
        concept_description: `Comisión de viajes - ${driver.full_name || 'Conductor'}`,
        amount: Math.round(amount * 100) / 100,
      },
    ],
    payer: {
      external_reference: driver.id,
      name: driver.full_name || 'Conductor',
    },
    metadata: {
      driver_id: driver.id,
      type: 'commission',
    },
  };

  if (PAYPERTIC_COLLECTOR_ID) {
    paymentPayload.collector_id = PAYPERTIC_COLLECTOR_ID;
  }

  const payRes = await fetch(PAYPERTIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${payperticToken}`,
    },
    body: JSON.stringify(paymentPayload),
  });

  if (!payRes.ok) {
    const errBody = await payRes.text();
    console.error('Paypertic create payment error:', payRes.status, errBody);
    return NextResponse.json({ error: 'Error al crear el pago en Paypertic.' }, { status: 502 });
  }

  const payData = await payRes.json();

  return NextResponse.json({
    form_url: payData.form_url,
    payment_id: payData.id,
    external_transaction_id: externalTransactionId,
    return_url_prefix: `${DASHBOARD_URL}/api/paypertic/return`,
  });
}
