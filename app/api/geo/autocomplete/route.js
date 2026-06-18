import { NextResponse } from 'next/server';
import { autocompleteAddressSalta } from '../../../../src/lib/geo/index.js';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = String(searchParams.get('q') || '').trim();
    const limit = Math.min(8, Math.max(1, Number(searchParams.get('limit') || 5)));

    if (query.length < 3) {
      return NextResponse.json({ ok: true, data: [] });
    }

    const results = await autocompleteAddressSalta(query, limit);
    return NextResponse.json({ ok: true, data: results });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Error de búsqueda' },
      { status: 500 },
    );
  }
}
