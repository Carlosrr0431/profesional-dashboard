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
const PAYPERTIC_COLLECTOR_ID = process.env.PAYPERTIC_COLLECTOR_ID;
const DASHBOARD_URL =
  process.env.NEXT_PUBLIC_APP_URL || 'https://profesional-dashboard.vercel.app';

// media_payment_id según BIN de la tarjeta (tabla Medios de Pago de Paypertic)
function getMediaPaymentId(cardNumber) {
  const n = cardNumber.replace(/\s/g, '');
  if (/^3[47]/.test(n)) return 2;            // American Express
  if (/^5[1-5]/.test(n) || /^2(2[2-9]|[3-6]\d|7[01])/.test(n)) return 5; // Mastercard
  if (/^6042/.test(n)) return 6;             // Cabal
  if (/^4/.test(n)) return 9;                // Visa
  return 9;
}

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

  // Validar datos de tarjeta
  const card = body?.card;
  if (!card) {
    return NextResponse.json({ error: 'Datos de tarjeta requeridos' }, { status: 400 });
  }

  const cardNumber = String(card.number || '').replace(/\s/g, '');
  const holderName = String(card.holder_name || '').trim();
  const expirationMonth = Number(card.expiration_month);
  const expirationYear = Number(card.expiration_year);
  const securityCode = String(card.security_code || '').trim();

  if (!cardNumber || cardNumber.length < 13 || cardNumber.length > 19) {
    return NextResponse.json({ error: 'Número de tarjeta inválido' }, { status: 400 });
  }
  if (!holderName) {
    return NextResponse.json({ error: 'Nombre del titular requerido' }, { status: 400 });
  }
  if (!expirationMonth || expirationMonth < 1 || expirationMonth > 12) {
    return NextResponse.json({ error: 'Mes de vencimiento inválido' }, { status: 400 });
  }
  if (!expirationYear || expirationYear < new Date().getFullYear()) {
    return NextResponse.json({ error: 'Año de vencimiento inválido' }, { status: 400 });
  }
  if (!securityCode || securityCode.length < 3) {
    return NextResponse.json({ error: 'Código de seguridad inválido' }, { status: 400 });
  }

  let payperticToken;
  try {
    payperticToken = await getPayperticToken();
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 502 });
  }

  const externalTransactionId = `comision-${driver.id}-${Date.now()}`;
  const mediaPaymentId = getMediaPaymentId(cardNumber);

  const paymentPayload = {
    type: 'online',
    external_transaction_id: externalTransactionId,
    currency_id: 'ARS',
    notification_url: `${DASHBOARD_URL}/api/paypertic/webhook`,
    details: [
      {
        external_reference: driver.id,
        concept_id: 'COMISION_VIAJES',
        concept_description: `Comisión de viajes - ${driver.full_name || 'Conductor'}`,
        amount: Math.round(amount * 100) / 100,
      },
    ],
    payment_methods: [
      {
        media_payment_id: mediaPaymentId,
        number: cardNumber,
        expiration_month: expirationMonth,
        expiration_year: expirationYear,
        security_code: securityCode,
        amount: Math.round(amount * 100) / 100,
        installments: 1,
        holder: {
          name: holderName,
          ...(card.holder_dni
            ? {
                identification: {
                  type: 'DNI_ARG',
                  number: String(card.holder_dni).replace(/\D/g, ''),
                  country: 'ARG',
                },
              }
            : {}),
        },
      },
    ],
    payer: {
      external_reference: driver.id,
      name: driver.full_name || 'Conductor',
    },
    metadata: {
      driver_id: driver.id,
      external_transaction_id: externalTransactionId,
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
    return NextResponse.json(
      { error: 'Error al procesar el pago. Verificá los datos de la tarjeta.' },
      { status: 502 },
    );
  }

  const payData = await payRes.json();
  const paymentStatus = payData.status;

  // Si el pago fue aprobado de forma sincrónica, registrarlo inmediatamente
  if (paymentStatus === 'approved') {
    const { error: insertError } = await supabase.from('commission_payments').insert({
      driver_id: driver.id,
      amount: Number(payData.final_amount) || amount,
      notes: `Pago online via Paypertic - ID: ${payData.id} - Tarjeta: ****${cardNumber.slice(-4)}`,
    });

    if (insertError) {
      // El pago fue aprobado en Paypertic — loguear pero no retornar error al usuario
      console.error('Error al registrar pago aprobado en Supabase:', insertError);
    }
  }

  return NextResponse.json({
    status: paymentStatus,
    status_detail: payData.status_detail || null,
    payment_id: payData.id,
    final_amount: payData.final_amount || amount,
  });
}
