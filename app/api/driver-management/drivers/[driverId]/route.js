import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { adminUpdateDriverPassword } from '../../../../../src/lib/driverPhoneProvision';

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

export async function PATCH(request, { params }) {
  try {
    const resolvedParams = await params;
    const driverId = resolvedParams?.driverId;
    if (!driverId) {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'driverId is required' } },
        { status: 400 }
      );
    }

    const updates = await request.json();
    if (!updates || typeof updates !== 'object') {
      return NextResponse.json(
        { ok: false, error: { code: 'BAD_REQUEST', message: 'updates payload is required' } },
        { status: 400 }
      );
    }

    const password = typeof updates.password === 'string' ? updates.password.trim() : '';
    const { password: _password, email: _email, ...driverUpdates } = updates;

    const supabase = getSupabaseAdmin();

    if (password) {
      const passwordResult = await adminUpdateDriverPassword({ driverId, password });
      if (!passwordResult.ok) {
        return NextResponse.json(
          {
            ok: false,
            error: {
              code: 'PASSWORD_UPDATE_FAILED',
              message: passwordResult.message || 'No se pudo actualizar la contraseña',
            },
          },
          { status: passwordResult.status || 400 },
        );
      }
    }

    const hasProfileUpdates = Object.keys(driverUpdates).length > 0;
    if (!hasProfileUpdates) {
      const { data: current, error: fetchError } = await supabase
        .from('drivers')
        .select('*')
        .eq('id', driverId)
        .single();
      if (fetchError) throw fetchError;
      return NextResponse.json({ ok: true, data: current });
    }

    const { data, error } = await supabase
      .from('drivers')
      .update(driverUpdates)
      .eq('id', driverId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ ok: true, data });
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
