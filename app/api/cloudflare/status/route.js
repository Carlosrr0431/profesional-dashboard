import { NextResponse } from 'next/server';
import { requireAdminUser } from '../../../../src/lib/adminAuthServer';
import { readCloudflareStatus } from '../../../../src/lib/cloudflarePlatform';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAdminUser(request);
  if (!auth.user) {
    return NextResponse.json(
      { ok: false, message: auth.error || 'No autorizado' },
      { status: auth.status || 401 },
    );
  }

  try {
    const status = await readCloudflareStatus();
    return NextResponse.json({ ok: true, ...status });
  } catch (error) {
    return NextResponse.json({
      ok: true,
      configured: true,
      health: { ok: false, message: error?.message || 'No se pudo leer Cloudflare' },
      failures: [{
        id: 'status',
        area: 'plataforma',
        operation: 'status',
        message: error?.message || 'No se pudo leer Cloudflare',
        created_at: new Date().toISOString(),
      }],
      jobs: [],
    });
  }
}
