import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Este endpoint es la return_url / back_url del formulario de Paypertic.
// El WebView del driver-app intercepta las navegaciones a esta URL para
// determinar si el pago fue aprobado o si el usuario canceló.
// También muestra una página HTML mínima por si se abre en un browser real.
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status') || 'unknown';

  if (status === 'approved') {
    return new NextResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>
        <p style="font-family:sans-serif;text-align:center;margin-top:40px">
          ✅ Pago aprobado. Podés cerrar esta ventana.
        </p>
      </body></html>`,
      { status: 200, headers: { 'Content-Type': 'text/html' } },
    );
  }

  return new NextResponse(
    `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>
      <p style="font-family:sans-serif;text-align:center;margin-top:40px">
        Operación cancelada. Podés cerrar esta ventana.
      </p>
    </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } },
  );
}
