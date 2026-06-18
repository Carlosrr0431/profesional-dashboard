import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

/** Tarifa activa de plataforma (todos los viajes operativos). */
const PLATFORM_TARIFF_KEYS = [
  'platform_tariff_per_km',
  'platform_tariff_base',
  'platform_commission_percent',
];

/** Tarifa activa para viajes de la app de pasajeros. */
const PASSENGER_APP_TARIFF_KEYS = [
  'passenger_app_tariff_per_km',
  'passenger_app_tariff_base',
  'passenger_app_commission_percent',
];

const TARIFF_KEYS = [...PLATFORM_TARIFF_KEYS, ...PASSENGER_APP_TARIFF_KEYS];

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
      .from('settings')
      .select('key, value')
      .in('key', TARIFF_KEYS);

    if (error) throw error;

    const map = {};
    (data || []).forEach((row) => {
      if (row?.key) map[row.key] = row.value;
    });

    return NextResponse.json({
      ok: true,
      data: map,
      activeSource: 'platform',
      platformKeys: PLATFORM_TARIFF_KEYS,
      passengerAppKeys: PASSENGER_APP_TARIFF_KEYS,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: err?.code || 'SERVER_ERROR',
          message: err?.message || 'Unexpected server error',
        },
      },
      { status: 500 }
    );
  }
}
