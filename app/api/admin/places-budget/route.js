import { NextResponse } from 'next/server';
import { readPlacesBudget } from '../../../../src/lib/googlePlacesBudgetStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const budget = await readPlacesBudget();
    return NextResponse.json({
      ok: true,
      period: budget.period,
      calls: budget.calls,
      limit: budget.limit,
      remaining: Math.max(0, budget.limit - budget.calls),
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, message: err?.message || 'No se pudo leer el contador de Places.' },
      { status: 500 },
    );
  }
}
