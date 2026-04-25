import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from('drivers')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: error.code || null,
            message: error.message || 'Supabase query failed',
            details: error.details || null,
            hint: error.hint || null,
          },
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data: data || [] });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: 'SERVER_ERROR',
          message: err?.message || 'Unexpected server error',
        },
      },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const email = String(body?.email || '').trim().toLowerCase();
    const password = String(body?.password || '');
    const profile = body?.profileData || {};

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'email and password are required' } },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { full_name: profile?.full_name || '' },
      email_confirm: true,
    });

    if (createUserError || !createdUser?.user?.id) {
      throw createUserError || new Error('Failed to create auth user');
    }

    const driverRow = {
      user_id: createdUser.user.id,
      full_name: profile?.full_name || '',
      phone: profile?.phone || null,
      driver_number: profile?.driver_number ? parseInt(profile.driver_number, 10) : null,
      vehicle_brand: profile?.vehicle_brand || null,
      vehicle_model: profile?.vehicle_model || null,
      vehicle_year: profile?.vehicle_year ? parseInt(profile.vehicle_year, 10) : null,
      vehicle_plate: profile?.vehicle_plate || null,
      vehicle_color: profile?.vehicle_color || null,
      vehicle_type: profile?.vehicle_type || 'auto',
      license_expiry: profile?.license_expiry || null,
    };

    const { data: driver, error: driverError } = await supabase
      .from('drivers')
      .insert(driverRow)
      .select()
      .single();

    if (driverError) {
      // Cleanup best-effort to avoid orphan auth users.
      await supabase.auth.admin.deleteUser(createdUser.user.id).catch(() => {});
      throw driverError;
    }

    return NextResponse.json({ ok: true, data: driver });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: err?.code || 'SERVER_ERROR',
          message: err?.message || 'Unexpected server error',
          details: err?.details || null,
          hint: err?.hint || null,
        },
      },
      { status: 500 }
    );
  }
}
