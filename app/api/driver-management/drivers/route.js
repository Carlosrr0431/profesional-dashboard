import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  isCompleteLoginEmail,
  isSyntheticAuthEmail,
  normalizeDriverPhone,
  normalizeLoginEmail,
} from '../../../../src/lib/driverRoles';

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
    const email = normalizeLoginEmail(body?.email || body?.login_email);
    const password = String(body?.password || body?.email_password || '');
    const profile = body?.profileData || {};

    if (!email || !password) {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'Correo y contraseña del correo son requeridos' } },
        { status: 400 }
      );
    }
    if (password.length < 8) {
      return NextResponse.json(
        {
          ok: false,
          error: { code: 'BAD_REQUEST', message: 'La contraseña del correo debe tener al menos 8 caracteres' },
        },
        { status: 400 },
      );
    }
    if (!isCompleteLoginEmail(email) || isSyntheticAuthEmail(email)) {
      return NextResponse.json(
        {
          ok: false,
          error: {
            code: 'BAD_REQUEST',
            message: 'Usá un correo personal válido. No uses @profesional.test.',
          },
        },
        { status: 400 },
      );
    }

    const supabase = getSupabaseAdmin();

    const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { full_name: profile?.full_name || '', driver_email_login: true },
      email_confirm: true,
    });

    if (createUserError || !createdUser?.user?.id) {
      throw createUserError || new Error('Failed to create auth user');
    }

    const billingMode = profile?.billing_mode === 'weekly_traditional'
      ? 'weekly_traditional'
      : 'commission_current';

    const phone = profile?.phone || null;
    const phoneNormalized = normalizeDriverPhone(phone) || null;

    const driverRow = {
      user_id: null,
      login_email: email,
      email_user_id: createdUser.user.id,
      email_password_initialized: true,
      full_name: profile?.full_name || '',
      phone,
      phone_normalized: phoneNormalized,
      driver_number: profile?.driver_number ? parseInt(profile.driver_number, 10) : null,
      vehicle_brand: profile?.vehicle_brand || null,
      vehicle_model: profile?.vehicle_model || null,
      vehicle_plate: profile?.vehicle_plate || null,
      vehicle_color: profile?.vehicle_color || null,
      vehicle_type: profile?.vehicle_type || 'auto',
      license_expiry: profile?.license_expiry || null,
      billing_mode: billingMode,
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
