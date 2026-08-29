import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  TARIFF_KEYS_BY_CHANNEL,
  overlayResolvedTariffSettings,
  fetchTariffWindows,
} from '../../../src/lib/resolveTariff';

export const dynamic = 'force-dynamic';

const PLATFORM_TARIFF_KEYS = Object.values(TARIFF_KEYS_BY_CHANNEL.platform);
const PASSENGER_APP_TARIFF_KEYS = Object.values(TARIFF_KEYS_BY_CHANNEL.passenger_app);
const PASSENGER_WEB_TARIFF_KEYS = Object.values(TARIFF_KEYS_BY_CHANNEL.passenger_web);
const TARIFF_KEYS = [
  ...PLATFORM_TARIFF_KEYS,
  ...PASSENGER_APP_TARIFF_KEYS,
  ...PASSENGER_WEB_TARIFF_KEYS,
];

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
    const [{ data, error }, windows] = await Promise.all([
      supabase.from('settings').select('key, value').in('key', TARIFF_KEYS),
      fetchTariffWindows(supabase),
    ]);

    if (error) throw error;

    const defaults = {};
    (data || []).forEach((row) => {
      if (row?.key) defaults[row.key] = row.value;
    });

    const resolved = overlayResolvedTariffSettings(defaults, windows, new Date());

    return NextResponse.json({
      ok: true,
      data: resolved,
      defaults,
      windows,
      activeSource: 'platform',
      platformKeys: PLATFORM_TARIFF_KEYS,
      passengerAppKeys: PASSENGER_APP_TARIFF_KEYS,
      passengerWebKeys: PASSENGER_WEB_TARIFF_KEYS,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: {
          code: err?.code || 'SERVER_ERROR',
          message: err?.message || 'Unexpected server error',
        },
      },
      { status: 500 },
    );
  }
}
