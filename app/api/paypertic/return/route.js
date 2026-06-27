import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const renderReturnHtml = (status) => {
  const normalized = String(status || '').toLowerCase();
  const isApproved = normalized === 'approved' || normalized === 'paid';
  const isRejected = ['rejected', 'cancelled', 'refunded', 'overdue', 'failed', 'denied'].includes(normalized);
  const isBack = normalized === 'back';
  const isFinal = isApproved || isRejected || isBack;
  const message = JSON.stringify({ type: 'paypertic_result', status });
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
    if (!${JSON.stringify(isFinal)}) {
      try { history.back(); } catch (e) {}
    }
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(${JSON.stringify(message)});
    }
  </script>
</body>
</html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
};

// Este endpoint es la return_url / back_url del formulario de Paypertic.
// Paypertic puede volver por GET o también enviar POST con datos básicos.
// Respondemos 200 en ambos casos para evitar errores en WebView Android.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'unknown';
  const ext = searchParams.get('ext') || 'none';
  console.log('[paypertic/return] GET llamado - status:', status, '| ext:', ext, '| URL completa:', request.url);
  console.log('[paypertic/return] Enviando postMessage al WebView:', status);
  return renderReturnHtml(status);
}

export async function POST(request) {
  const { searchParams } = new URL(request.url);
  let status = searchParams.get('status') || '';
  const ext = searchParams.get('ext') || 'none';

  // Si Paypertic manda estado en el body, lo usamos cuando no vino en query.
  try {
    const rawBody = await request.text();
    if (rawBody) {
      if (rawBody.trim().startsWith('{')) {
        const asJson = JSON.parse(rawBody);
        if (!status) {
          status = String(asJson?.status || asJson?.status_detail || '').toLowerCase();
        }
      } else if (!status) {
        const formParams = new URLSearchParams(rawBody);
        status = String(formParams.get('status') || formParams.get('status_detail') || '').toLowerCase();
      }
    }
  } catch {
    // ignorar body inválido, nos quedamos con query params.
  }

  const normalizedStatus = status || 'unknown';
  console.log('[paypertic/return] POST llamado - status:', normalizedStatus, '| ext:', ext);
  return renderReturnHtml(normalizedStatus);
}
