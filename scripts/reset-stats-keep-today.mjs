import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

const CUTOFF_ISO = '2026-09-19T00:00:00.000-03:00';
const OPEN_STATUSES = [
  'pending',
  'queued',
  'scheduled',
  'accepted',
  'going_to_pickup',
  'in_progress',
  'awaiting_address_selection',
];
const CHILD_TABLES = [
  'commission_accumulation_log',
  'trip_chat_messages',
  'trip_whatsapp_messages',
  'driver_ratings',
  'dispatch_queue',
  'trip_dispatch_queue',
];
const PAGE = 200;

function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const cwd = resolve(process.cwd());
const dashboardRoot = resolve(cwd, '..', 'profesional-dashboard');
loadEnvFile(resolve(cwd, '.env'));
loadEnvFile(resolve(cwd, '.env.local'));
loadEnvFile(resolve(dashboardRoot, '.env'));
loadEnvFile(resolve(dashboardRoot, '.env.local'));

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function isOpenStatus(status) {
  return OPEN_STATUSES.includes(String(status || '').trim().toLowerCase());
}

function shouldDelete(trip) {
  if (!trip?.created_at) return false;
  if (new Date(trip.created_at).getTime() >= new Date(CUTOFF_ISO).getTime()) return false;
  return !isOpenStatus(trip.status);
}

async function countExact(filters) {
  let query = supabase.from('trips').select('id', { count: 'exact', head: true });
  if (filters?.gteCreatedAt) query = query.gte('created_at', filters.gteCreatedAt);
  if (filters?.ltCreatedAt) query = query.lt('created_at', filters.ltCreatedAt);
  if (filters?.inStatus) query = query.in('status', filters.inStatus);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

async function fetchAllTripsLite() {
  const rows = [];
  let from = 0;
  while (true) {
    const to = from + 999;
    const { data, error } = await supabase
      .from('trips')
      .select('id, status, created_at, driver_id')
      .order('created_at', { ascending: true })
      .range(from, to);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < 1000) break;
    from += 1000;
  }
  return rows;
}

async function deleteByIds(table, column, ids) {
  if (!ids.length) return 0;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += PAGE) {
    const chunk = ids.slice(i, i + PAGE);
    const { error, count } = await supabase
      .from(table)
      .delete({ count: 'exact' })
      .in(column, chunk);
    if (error) {
      if (error.code === '42P01' || /does not exist|schema cache/i.test(error.message || '')) {
        return deleted;
      }
      throw error;
    }
    deleted += count || chunk.length;
  }
  return deleted;
}

async function recountDriverTotalTrips(remaining) {
  const completedByDriver = new Map();
  for (const trip of remaining) {
    if (String(trip.status || '').toLowerCase() !== 'completed') continue;
    if (!trip.driver_id) continue;
    completedByDriver.set(trip.driver_id, (completedByDriver.get(trip.driver_id) || 0) + 1);
  }

  const { data: drivers, error } = await supabase.from('drivers').select('id, total_trips');
  if (error) {
    if (error.code === '42703' || /total_trips/i.test(error.message || '')) {
      console.log('drivers.total_trips no existe; se omite el recálculo.');
      return;
    }
    throw error;
  }

  for (const driver of drivers || []) {
    const next = completedByDriver.get(driver.id) || 0;
    if (Number(driver.total_trips || 0) === next) continue;
    const { error: updateError } = await supabase
      .from('drivers')
      .update({ total_trips: next })
      .eq('id', driver.id);
    if (updateError) throw updateError;
  }
}

async function main() {
  const beforeAll = await countExact();
  const beforeToday = await countExact({ gteCreatedAt: CUTOFF_ISO });
  const beforeClosed = await countExact({
    ltCreatedAt: CUTOFF_ISO,
    inStatus: ['completed', 'cancelled'],
  });

  console.log(
    JSON.stringify(
      {
        cutoff: CUTOFF_ISO,
        trips_total_before: beforeAll,
        trips_today_before: beforeToday,
        closed_before_today_before: beforeClosed,
      },
      null,
      2,
    ),
  );

  const trips = await fetchAllTripsLite();
  const toDelete = trips.filter(shouldDelete).map((trip) => trip.id);
  console.log(`viajes a borrar: ${toDelete.length}`);

  if (toDelete.length) {
    const { error: convError } = await supabase
      .from('whatsapp_conversations')
      .update({ last_trip_id: null })
      .in('last_trip_id', toDelete);
    if (convError && convError.code !== '42P01') throw convError;

    for (const table of CHILD_TABLES) {
      try {
        await deleteByIds(table, 'trip_id', toDelete);
      } catch (error) {
        if (!/does not exist|schema cache|column/i.test(error.message || '')) throw error;
      }
    }

    const deleted = await deleteByIds('trips', 'id', toDelete);
    console.log(`viajes borrados: ${deleted}`);
  }

  const remaining = await fetchAllTripsLite();
  await recountDriverTotalTrips(remaining);

  const closedLeftover = remaining.filter(
    (trip) =>
      new Date(trip.created_at).getTime() < new Date(CUTOFF_ISO).getTime() &&
      ['completed', 'cancelled'].includes(String(trip.status || '').toLowerCase()),
  );
  const keptBeforeToday = remaining.filter(
    (trip) => new Date(trip.created_at).getTime() < new Date(CUTOFF_ISO).getTime(),
  );
  const today = remaining.filter(
    (trip) => new Date(trip.created_at).getTime() >= new Date(CUTOFF_ISO).getTime(),
  );

  const byStatus = {};
  for (const trip of remaining) {
    const key = String(trip.status || 'sin_estado');
    byStatus[key] = (byStatus[key] || 0) + 1;
  }

  console.log(
    JSON.stringify(
      {
        trips_total_after: remaining.length,
        trips_today_after: today.length,
        trips_before_today_kept: keptBeforeToday.length,
        closed_before_today_after: closedLeftover.length,
        kept_before_today_statuses: keptBeforeToday.reduce((acc, trip) => {
          const key = String(trip.status || 'sin_estado');
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        }, {}),
        remaining_by_status: byStatus,
      },
      null,
      2,
    ),
  );

  if (closedLeftover.length) {
    console.error('Quedaron viajes completed/cancelled anteriores a hoy.');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
