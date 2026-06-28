import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { registerCommissionPayment } from '../../../src/lib/commissionPaymentRegister';

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

const pickFirstText = (...values) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
};

const isPayperticApprovedStatus = (payData) => {
  const normalizedStatus = String(payData?.status || '').toLowerCase();
  const approvedStatuses = new Set([
    'approved',
    'paid',
    'accredited',
    'completed',
    'success',
    'succeeded',
  ]);
  return approvedStatuses.has(normalizedStatus);
};

const extractTransferInfo = (payData) => {
  const transfer = payData?.transfer || {};
  const account = transfer?.account || payData?.account || {};
  const bank = transfer?.bank || payData?.bank || {};
  const instructions = transfer?.instructions || payData?.instructions || {};
  const payer = transfer?.payer || payData?.payer || {};
  const destination = payData?.destination || {};
  const metadata = payData?.metadata || {};
  const firstPaymentMethod = Array.isArray(payData?.payment_methods) ? payData.payment_methods[0] : null;

  const cvu = pickFirstText(
    transfer?.cvu,
    account?.cvu,
    payData?.cvu,
    instructions?.cvu,
    metadata?.cvu,
  );
  const cbu = pickFirstText(
    transfer?.cbu,
    account?.cbu,
    payData?.cbu,
    instructions?.cbu,
  );
  const alias = pickFirstText(
    transfer?.alias,
    account?.alias,
    payData?.alias,
    instructions?.alias,
    metadata?.alias,
  );
  const holderName = pickFirstText(
    transfer?.holder_name,
    transfer?.holderName,
    account?.holder_name,
    account?.holderName,
    payer?.name,
    destination?.holder_name,
    payData?.holder_name,
  );
  const bankName = pickFirstText(
    transfer?.bank_name,
    transfer?.bankName,
    bank?.name,
    firstPaymentMethod?.gateway?.name,
    destination?.bank_name,
    payData?.bank_name,
  );
  const reference = pickFirstText(
    transfer?.reference,
    transfer?.payment_reference,
    payData?.payment_reference,
    payData?.external_transaction_id,
  );
  const expirationDate = pickFirstText(
    transfer?.expiration_date,
    transfer?.expires_at,
    payData?.due_date,
    payData?.last_due_date,
  );

  const hasAnyTransferField = Boolean(cvu || cbu || alias || holderName || bankName || reference);
  if (!hasAnyTransferField) return null;

  return {
    cvu,
    cbu,
    alias,
    holder_name: holderName,
    bank_name: bankName,
    reference,
    expiration_date: expirationDate,
  };
};

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
    throw new Error(`Error de autenticacion Paypertic: ${res.status}`);
  }

  const data = await res.json();
  return data.access_token;
}

export async function GET(request) {
  console.log('[paypertic] GET /api/paypertic - consultando estado de pago');

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    console.error('[paypertic] Error: Authorization header faltante o invalido en GET');
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const userToken = authHeader.slice(7);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser(userToken);

  if (authError || !user) {
    console.error('[paypertic] Token de Supabase invalido en GET:', authError?.message);
    return NextResponse.json({ error: 'Token invalido' }, { status: 401 });
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

  if (isPayperticApprovedStatus(payData)) {
    const payAmount = Number(payData?.final_amount);
    if (payAmount > 0) {
      try {
        await registerCommissionPayment(supabase, {
          driverId: driver.id,
          amount: payAmount,
          paymentSource: 'paypertic',
          payperticId: payData?.id ? String(payData.id) : null,
          externalTransactionId: payData?.external_transaction_id
            ? String(payData.external_transaction_id)
            : null,
          resetPendingToZero: true,
        });
      } catch (registerErr) {
        console.error('[paypertic] Fallback registro de pago falló:', registerErr?.message || registerErr);
      }
    }
  }

  return NextResponse.json({
    id: payData.id,
    status: payData.status,
    status_detail: payData.status_detail || null,
    final_amount: payData.final_amount || null,
    process_date: payData.process_date || null,
    paid_date: payData.paid_date || payData.accreditation_date || null,
    external_transaction_id: payData.external_transaction_id || null,
    receipt_url: receiptUrl,
    form_url: payData.form_url || null,
    transfer_info: extractTransferInfo(payData),
  });
}

export async function POST(request) {
  console.log('[paypertic] POST /api/paypertic - iniciando creacion de sesion de pago');

  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    console.error('[paypertic] Error: Authorization header faltante o invalido');
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  const userToken = authHeader.slice(7);
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // Paralelizar: validar token Supabase + obtener token Paypertic + leer body
  let user, body, payperticToken;
  try {
    const [authResult, bodyResult, tokenResult] = await Promise.all([
      supabase.auth.getUser(userToken),
      request.json().catch(() => null),
      getPayperticToken(),
    ]);

    const { data: { user: authUser }, error: authError } = authResult;
    if (authError || !authUser) {
      console.error('[paypertic] Token de Supabase invalido:', authError?.message);
      return NextResponse.json({ error: 'Token invalido' }, { status: 401 });
    }
    user = authUser;
    body = bodyResult;
    payperticToken = tokenResult;
    console.log('[paypertic] Usuario autenticado:', user.id);
    console.log('[paypertic] Token de Paypertic obtenido OK');
  } catch (err) {
    console.error('[paypertic] Error en inicializacion paralela:', err.message);
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  const amount = Number(body?.amount);
  console.log('[paypertic] Monto recibido:', amount);
  if (!amount || amount <= 0) {
    console.error('[paypertic] Monto invalido:', body?.amount);
    return NextResponse.json({ error: 'Monto invalido' }, { status: 400 });
  }

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

  // Sin return_url ni back_url: Pagotic maneja la navegaci?n dentro de checkout.paypertic.com.
  // El WebView nunca debe salir a nuestro dominio (evita pantalla blanca).
  // La confirmaci?n del pago llega por webhook + consulta de estado en la app.
  const notificationUrl = `${DASHBOARD_URL}/api/paypertic/webhook`;
  console.log('[paypertic] notification_url:', notificationUrl);

  const paymentPayload = {
    external_transaction_id: externalTransactionId,
    currency_id: 'ARS',
    notification_url: notificationUrl,
    details: [
      {
        external_reference: driver.id,
        concept_id: 'COMISION_VIAJES',
        concept_description: `Comision de viajes - ${driver.full_name || 'Conductor'}`,
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

  return NextResponse.json({
    form_url: payData.form_url,
    payment_id: payData.id,
    external_transaction_id: externalTransactionId,
  });
}
