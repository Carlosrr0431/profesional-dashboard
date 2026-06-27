import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PAYPERTIC_CHECKOUT = 'https://checkout.paypertic.com/app';

const FINAL_REJECTED = ['rejected', 'cancelled', 'refunded', 'overdue', 'failed', 'denied'];

const renderReturnHtml = (status) => {
  const normalized = String(status || '').toLowerCase();
  const isApproved = normalized === 'approved' || normalized === 'paid';
  const isRejected = FINAL_REJECTED.includes(normalized);
  const isBack = normalized === 'back';
  const isFinal = isApproved || isRejected || isBack;
  const message = JSON.stringify({ type: 'paypertic_result', status: normalized });
  const uiMessage = isApproved
    ? '✅ Pago aprobado. Volviendo a la app...'
    : isFinal
      ? 'Operación finalizada. Volviendo a la app...'
      : '';

  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body style="margin:0;background:${isFinal ? '#fff' : 'transparent'};font-family:sans-serif;text-align:center;padding-top:${isFinal ? '60px' : '0'}">
  ${uiMessage ? `<p style="font-size:18px;color:#374151">${uiMessage}</p>` : ''}
  <script>
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(${JSON.stringify(message)});
    }
  </script>
</body>
</html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
};

const extractPaymentId = (searchParams, bodyJson, formParams) => {
  const fromQuery = searchParams.get('pid') || searchParams.get('payment_id');
  if (fromQuery) return String(fromQuery);

  if (bodyJson?.id) return String(bodyJson.id);

  const formId = formParams?.get('id');
  if (formId) return String(formId);

  const formUrl = bodyJson?.form_url;
  if (typeof formUrl === 'string') {
    const match = formUrl.match(/\/app\/([^/?#]+)/);
    if (match?.[1]) return match[1];
  }

  return null;
};

const buildPagoticRedirect = (paymentId, status, bodyJson) => {
  const normalized = String(status || '').toLowerCase();
  const isApproved = normalized === 'approved' || normalized === 'paid';
  const isPending = ['issued', 'pending', 'in_process', 'unknown', ''].includes(normalized);

  if (isPending) {
    return `${PAYPERTIC_CHECKOUT}/${paymentId}/guest-transfer-confirm-pay`;
  }

  if (isApproved) {
    const formUrl = bodyJson?.form_url;
    if (typeof formUrl === 'string' && formUrl.startsWith('https://checkout.paypertic.com/')) {
      return formUrl;
    }
    return `${PAYPERTIC_CHECKOUT}/${paymentId}`;
  }

  return `${PAYPERTIC_CHECKOUT}/${paymentId}`;
};

const parseReturnRequest = async (request) => {
  const { searchParams } = new URL(request.url);
  let status = searchParams.get('status') || '';
  let bodyJson = null;
  let formParams = null;

  try {
    const rawBody = await request.text();
    if (rawBody) {
      if (rawBody.trim().startsWith('{')) {
        bodyJson = JSON.parse(rawBody);
        if (!status) {
          status = String(bodyJson?.status || bodyJson?.status_detail || '').toLowerCase();
        }
      } else if (!status) {
        formParams = new URLSearchParams(rawBody);
        status = String(formParams.get('status') || formParams.get('status_detail') || '').toLowerCase();
      }
    }
  } catch {
    // body inválido: seguir con query params
  }

  return {
    searchParams,
    status: status || 'unknown',
    bodyJson,
    formParams,
  };
};

const handleReturn = async (request, method) => {
  const { searchParams, status, bodyJson, formParams } = await parseReturnRequest(request);
  const ext = searchParams.get('ext') || 'none';
  const normalizedStatus = String(status || 'unknown').toLowerCase();

  console.log(
    `[paypertic/return] ${method} llamado - status:`,
    normalizedStatus,
    '| ext:',
    ext,
  );

  if (normalizedStatus === 'back') {
    console.log('[paypertic/return] status=back, respondiendo HTML para la app');
    return renderReturnHtml('back');
  }

  const paymentId = extractPaymentId(searchParams, bodyJson, formParams);
  const isRejected = FINAL_REJECTED.includes(normalizedStatus);

  if (paymentId && !isRejected) {
    const target = buildPagoticRedirect(paymentId, normalizedStatus, bodyJson);
    console.log('[paypertic/return] Redirect 303 a Pagotic:', target);
    return NextResponse.redirect(target, 303);
  }

  if (normalizedStatus === 'approved' || normalizedStatus === 'paid' || isRejected) {
    console.log('[paypertic/return] Respondiendo HTML final para WebView:', normalizedStatus);
    return renderReturnHtml(normalizedStatus);
  }

  console.log('[paypertic/return] Sin payment_id, respondiendo HTML fallback');
  return renderReturnHtml(normalizedStatus);
};

// Paypertic puede volver por GET o POST. Para transferencias (issued) redirigimos
// de vuelta al checkout de Pagotic para evitar pantalla blanca en el WebView.
export async function GET(request) {
  return handleReturn(request, 'GET');
}

export async function POST(request) {
  return handleReturn(request, 'POST');
}
