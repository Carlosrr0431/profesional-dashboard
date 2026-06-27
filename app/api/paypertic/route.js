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

export async function GET(request) {
  console.log('[paypertic] GET /api/paypertic - consultando estado de pago');

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    console.error('[paypertic] Error: Authorization header faltante o inválido en GET');
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const userToken = authHeader.slice(7);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(userToken);

  if (authError || !user) {
    console.error('[paypertic] Token de Supabase inválido en GET:', authError?.message);
    return NextResponse.json({ error: 'Token inválido' }, { status: 401 });
  }

  const { data: driver, error: driverError } = await supabase
    .from('drivers')
    .select('id')
    .eq('user_id', user.id)
    .single();

  if (driverError || !driver) {
    console.error('[paypertic] Conductor no encontrado en GET para user_id:', user.id, driverError?.message);
    return NextResponse.json({ error: 'Conductor no encontrado' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const paymentId = searchParams.get('payment_id') || searchParams.get('id');

  if (!paymentId) {
    return NextResponse.json({ error: 'Falta payment_id' }, { status: 400 });
  }

  let payperticToken;
  try {
    payperticToken = await getPayperticToken();
  } catch (err) {
    console.error('[paypertic] Error al obtener token para GET estado:', err.message);
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  const payRes = await fetch(`${PAYPERTIC_API_URL}/${encodeURIComponent(paymentId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${payperticToken}`,
    },
  });

  if (!payRes.ok) {
    const errBody = await payRes.text();
    console.error('[paypertic] Error al consultar pago en Paypertic:', payRes.status, errBody);
    return NextResponse.json({ error: 'Error al consultar estado del pago.' }, { status: 502 });
  }

  const payData = await payRes.json();
  const paymentDriverId = payData?.metadata?.driver_id;
  if (paymentDriverId && paymentDriverId !== driver.id) {
    console.error('[paypertic] Pago no pertenece al conductor autenticado:', paymentId, driver.id, paymentDriverId);
    return NextResponse.json({ error: 'Acceso denegado al pago' }, { status: 403 });
  }

  const receiptCandidates = [
    payData?.receipt_url,
    payData?.receipt?.url,
    payData?.receipt?.download_url,
    payData?.voucher_url,
    payData?.ticket_url,
    payData?.pdf_url,
    payData?.download_url,
    payData?.links?.receipt,
    payData?.links?.download,
  ];
  const receiptUrl =
    receiptCandidates.find(
      (value) => typeof value === 'string' && value.trim().toLowerCase().startsWith('http'),
    ) || null;

  return NextResponse.json({
    id: payData.id,
    status: payData.status,
    status_detail: payData.status_detail || null,
    final_amount: payData.final_amount || null,
    process_date: payData.process_date || null,
    paid_date: payData.paid_date || null,
    external_transaction_id: payData.external_transaction_id || null,
    receipt_url: receiptUrl,
  });
}

export async function POST(request) {
  console.log('[paypertic] POST /api/paypertic - iniciando creación de sesión de pago');
  // Verificar Authorization header con token de Supabase del conductor
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    console.error('[paypertic] Error: Authorization header faltante o inválido');
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const userToken = authHeader.slice(7);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Paralelizar: validar token Supabase + obtener token Paypertic + leer body
  // simult?neamente para reducir la latencia total del endpoint.
  let user, body, payperticToken;
  try {
    const [authResult, bodyResult, tokenResult] = await Promise.all([
      supabase.auth.getUser(userToken),
      request.json().catch(() => null),
      getPayperticToken(),
    ]);

    const { data: { user: authUser }, error: authError } = authResult;
    if (authError || !authUser) {
      console.error('[paypertic] Token de Supabase inv?lido:', authError?.message);
      return NextResponse.json({ error: 'Token inv?lido' }, { status: 401 });
    }
    user = authUser;
    body = bodyResult;
    payperticToken = tokenResult;
    console.log('[paypertic] Usuario autenticado:', user.id);
    console.log('[paypertic] Token de Paypertic obtenido OK');
  } catch (err) {
    console.error('[paypertic] Error en inicializaci?n paralela:', err.message);
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  const amount = Number(body?.amount);
  console.log('[paypertic] Monto recibido:', amount);
  if (!amount || amount <= 0) {
    console.error('[paypertic] Monto inv?lido:', body?.amount);
    return NextResponse.json({ error: 'Monto inv?lido' }, { status: 400 });
  }

  // Obtener datos del conductor
  const { data: driver, error: driverError } = await supabase
    .from('drivers')
    .select('id, full_name')
    .eq('user_id', user.id)
    .single();

  if (driverError || !driver) {
    console.error('[paypertic] Conductor no encontrado para user_id:', user.id, driverError?.message);
    return NextResponse.json({ error: 'Conductor no encontrado' }, { status: 404 });
  }
  console.log('[paypertic] Conductor encontrado:', driver.id, driver.full_name);

  const externalTransactionId = `comision-${driver.id}-${Date.now()}`;
  console.log('[paypertic] external_transaction_id:', externalTransactionId);

  // URLs de retorno ��� el WebView del app detecta estas URLs para cerrar el formulario
  const returnUrl = `${DASHBOARD_URL}/api/paypertic/return?status=approved&ext=${externalTransactionId}`;
  const backUrl = `${DASHBOARD_URL}/api/paypertic/return?status=back&ext=${externalTransactionId}`;
  console.log('[paypertic] return_url:', returnUrl);
  console.log('[paypertic] back_url:', backUrl);
  console.log('[paypertic] notification_url:', `${DASHBOARD_URL}/api/paypertic/webhook`);

  const paymentPayload = {
    // Sin type: Paypertic devuelve form_url para que el usuario elija el medio de pago
    // (incluye opciones como QR), y solo se fuerza 1 cuota para tarjeta de credito.
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
      email: 'carlos.facundo.rr@gmail.com',
    },
    metadata: {
      driver_id: driver.id,
      type: 'commission',
    },
    presets: {
      installments: 1,
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

  console.log('[paypertic] Enviando solicitud a Paypertic API, status:', payRes.status);
  if (!payRes.ok) {
    const errBody = await payRes.text();
    console.error('[paypertic] Error al crear pago en Paypertic:', payRes.status, errBody);
    return NextResponse.json({ error: 'Error al crear el pago en Paypertic.' }, { status: 502 });
  }

  const payData = await payRes.json();
  console.log('[paypertic] Respuesta de Paypertic - form_url:', payData.form_url, '| payment_id:', payData.id);
  console.log('[paypertic] Respuesta completa de Paypertic:', JSON.stringify(payData));

  return NextResponse.json({
    form_url: payData.form_url,
    payment_id: payData.id,
    external_transaction_id: externalTransactionId,
    return_url_prefix: `${DASHBOARD_URL}/api/paypertic/return`,
  });
}
