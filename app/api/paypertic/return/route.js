import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Este endpoint es la return_url / back_url del formulario de Paypertic.
// Envía un postMessage al WebView de React Native para que la app detecte
// el resultado sin depender de interceptar navegaciones de URL.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'unknown';
  const isApproved = status === 'approved';

  // El payload que recibirá el onMessage del WebView
  const message = JSON.stringify({ type: 'paypertic_result', status });

  return new NextResponse(
    `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"/></head>
<body style="background:#fff;font-family:sans-serif;text-align:center;padding-top:60px">
  <p style="font-size:18px;color:#374151">
    ${isApproved ? '✅ Pago aprobado. Volviendo a la app...' : 'Operación cancelada. Volviendo a la app...'}
  </p>
  <script>
    // Notificar al WebView de React Native (mecanismo principal)
    if (window.ReactNativeWebView) {
      window.ReactNativeWebView.postMessage(${JSON.stringify(message)});
    }
  </script>
</body>
</html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } },
  );
}
