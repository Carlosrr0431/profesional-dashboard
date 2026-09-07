import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  TARIFF_CHANNELS,
  parseTimeToMinutes,
  parseTariffNumber,
  fetchTariffWindows,
  normalizeScheduleKind,
  normalizeWeekdays,
  normalizeSpecificDate,
} from '../../../src/lib/resolveTariff';

export const dynamic = 'force-dynamic';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function jsonError(message, status = 400, code = 'BAD_REQUEST') {
  return NextResponse.json({ ok: false, error: { code, message } }, { status });
}

function parseWindowBody(body = {}) {
  const channel = String(body.channel || '').trim();
  if (!TARIFF_CHANNELS.includes(channel)) {
    return { error: 'Canal inválido. Usá platform, passenger_app o passenger_web.' };
  }

  const startMinute = body.start_minute != null
    ? Number(body.start_minute)
    : parseTimeToMinutes(body.startTime || body.start_time);
  const endMinute = body.end_minute != null
    ? Number(body.end_minute)
    : parseTimeToMinutes(body.endTime || body.end_time);

  if (!Number.isFinite(startMinute) || startMinute < 0 || startMinute > 1439) {
    return { error: 'Hora de inicio inválida.' };
  }
  if (!Number.isFinite(endMinute) || endMinute < 0 || endMinute > 1439) {
    return { error: 'Hora de fin inválida.' };
  }
  if (startMinute === endMinute) {
    return { error: 'La franja tiene que tener un rango (inicio distinto de fin).' };
  }

  const perKm = parseTariffNumber(body.per_km ?? body.perKm, 0);
  const base = parseTariffNumber(body.base, 0);
  const commissionPercent = Math.min(100, parseTariffNumber(body.commission_percent ?? body.commission, 0));
  const scheduleKind = normalizeScheduleKind(body.schedule_kind || body.scheduleKind);
  const label = String(body.label || '').trim().slice(0, 80) || null;

  const row = {
    channel,
    start_minute: Math.round(startMinute),
    end_minute: Math.round(endMinute),
    per_km: Math.round(perKm),
    base: Math.round(base),
    commission_percent: Math.round(commissionPercent),
    enabled: body.enabled !== false,
    updated_at: new Date().toISOString(),
    schedule_kind: scheduleKind,
    weekdays: [],
    specific_date: null,
    label,
  };

  if (scheduleKind === 'weekdays') {
    const weekdays = normalizeWeekdays(body.weekdays);
    if (!weekdays.length) {
      return { error: 'Elegí al menos un día de la semana.' };
    }
    row.weekdays = weekdays;
  } else if (scheduleKind === 'date') {
    const specificDate = normalizeSpecificDate(body.specific_date || body.specificDate);
    if (!specificDate) {
      return { error: 'Elegí el día específico.' };
    }
    row.specific_date = specificDate;
  }

  return { row };
}

function scheduleColumnMissing(err) {
  const message = err?.message || '';
  return err?.code === '42703' || /schedule_kind|weekdays|specific_date|\blabel\b/i.test(message);
}

function windowWriteError(err, fallback) {
  const missingTable = err?.code === '42P01' || /tariff_windows/i.test(err?.message || '');
  const missingCols = scheduleColumnMissing(err);
  return {
    code: missingCols ? 'MISSING_COLUMNS' : (missingTable ? 'MISSING_TABLE' : (err?.code || 'SERVER_ERROR')),
    message: missingCols
      ? 'Falta actualizar la tabla tariff_windows. Ejecutá supabase/tariff_windows_schedule.sql en Supabase.'
      : missingTable
        ? 'Falta crear la tabla tariff_windows. Ejecutá el SQL de supabase/tariff_windows.sql en Supabase.'
        : (err?.message || fallback),
  };
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const windows = await fetchTariffWindows(supabase);
    return NextResponse.json({ ok: true, data: windows });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: { code: err?.code || 'SERVER_ERROR', message: err?.message || 'Error' } },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = parseWindowBody(body);
    if (parsed.error) return jsonError(parsed.error);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('tariff_windows')
      .insert(parsed.row)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    const parsed = windowWriteError(err, 'No se pudo crear la franja.');
    return NextResponse.json(
      { ok: false, error: parsed },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json().catch(() => null);
    const id = String(body?.id || '').trim();
    if (!id) return jsonError('Falta el id de la franja.');

    const parsed = parseWindowBody(body);
    if (parsed.error) return jsonError(parsed.error);

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('tariff_windows')
      .update(parsed.row)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    const parsed = windowWriteError(err, 'No se pudo actualizar la franja.');
    return NextResponse.json(
      { ok: false, error: parsed },
      { status: 500 },
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = String(searchParams.get('id') || '').trim();
    if (!id) return jsonError('Falta el id de la franja.');

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('tariff_windows').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: { code: err?.code || 'SERVER_ERROR', message: err?.message || 'No se pudo borrar la franja.' } },
      { status: 500 },
    );
  }
}
