import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('service_zones')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
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
    const color = String(body?.color || '#DC2626').trim();
    const coordinates = body?.coordinates;

    if (!name) {
      return NextResponse.json(
        { ok: false, error: 'El nombre es obligatorio' },
        { status: 400 }
      );
    }
    if (!Array.isArray(coordinates) || coordinates.length < 3) {
      return NextResponse.json(
        { ok: false, error: 'El polígono debe tener al menos 3 puntos' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('service_zones')
      .insert({ name, color, coordinates })
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
      return NextResponse.json(
        { ok: false, error: 'El id es obligatorio' },
        { status: 400 }
      );
    }

    const allowed = {};
    if (updates.name !== undefined) allowed.name = String(updates.name).trim();
    if (updates.color !== undefined) allowed.color = String(updates.color).trim();
    if (updates.coordinates !== undefined) allowed.coordinates = updates.coordinates;
    if (updates.is_active !== undefined) allowed.is_active = Boolean(updates.is_active);
    allowed.updated_at = new Date().toISOString();

    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('service_zones')
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
      return NextResponse.json(
        { ok: false, error: 'El id es obligatorio' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase.from('service_zones').delete().eq('id', id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || 'Error inesperado' },
      { status: 500 }
    );
  }
}
