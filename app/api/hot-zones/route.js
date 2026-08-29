import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { normalizeFareSurchargePercent } from '../../../src/lib/hotZones';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function isMissingTable(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01' || message.includes('hot_zones') && message.includes('does not exist');
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('hot_zones')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      if (isMissingTable(error)) return NextResponse.json({ ok: true, data: [] });
      throw error;
    }
    return NextResponse.json({ ok: true, data: data || [] });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Error inesperado' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const name = String(body?.name || '').trim();
    const color = String(body?.color || '#D97706').trim();
    const coordinates = body?.coordinates;
    const fare_surcharge_percent = normalizeFareSurchargePercent(body?.fare_surcharge_percent);

    if (!name) {
      return NextResponse.json({ ok: false, error: 'El nombre es obligatorio' }, { status: 400 });
    }
    if (!Array.isArray(coordinates) || coordinates.length < 3) {
      return NextResponse.json(
        { ok: false, error: 'El polígono debe tener al menos 3 puntos' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('hot_zones')
      .insert({ name, color, coordinates, fare_surcharge_percent })
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, data }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Error inesperado' },
      { status: 500 }
    );
  }
}

export async function PATCH(request) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) {
      return NextResponse.json({ ok: false, error: 'El id es obligatorio' }, { status: 400 });
    }

    const allowed = {};
    if (updates.name !== undefined) allowed.name = String(updates.name).trim();
    if (updates.color !== undefined) allowed.color = String(updates.color).trim();
    if (updates.coordinates !== undefined) allowed.coordinates = updates.coordinates;
    if (updates.is_active !== undefined) allowed.is_active = Boolean(updates.is_active);
    if (updates.fare_surcharge_percent !== undefined) {
      allowed.fare_surcharge_percent = normalizeFareSurchargePercent(updates.fare_surcharge_percent);
    }
    allowed.updated_at = new Date().toISOString();

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('hot_zones')
      .update(allowed)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Error inesperado' },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ ok: false, error: 'El id es obligatorio' }, { status: 400 });
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('hot_zones').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Error inesperado' },
      { status: 500 }
    );
  }
}
