import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isWithinSaltaCapital } from '../../../src/lib/constants';
import { buildLocationViews } from '../../../src/lib/tripLocationStats';
import { detectTripSource, emptySourceCounts } from '../../../src/lib/detectTripSource';
import { fetchAllPages, SUPABASE_PAGE_SIZE } from '../../../src/lib/pagedQuery';

const TRIP_SELECT = [
  'id',
  'status',
  'price',
  'distance_km',
  'duration_minutes',
  'commission_amount',
  'origin_lat',
  'origin_lng',
  'origin_address',
  'destination_lat',
  'destination_lng',
  'destination_address',
  'created_at',
  'cancel_reason',
  'notes',
  'driver_id',
].join(', ');

const ART_TZ = 'America/Argentina/Buenos_Aires';
const WEEKDAY_LABELS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

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

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
}

function isValidMonth(value) {
  return /^\d{4}-\d{2}$/.test(String(value || ''));
}

function artDayKey(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ART_TZ }).format(date);
}

function artHour(date) {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: ART_TZ,
    hour: '2-digit',
    hour12: false,
  }).format(date);
  return Number(hour) % 24;
}

function artWeekday(date) {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: ART_TZ,
    weekday: 'short',
  }).format(date);
  const map = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[weekday] ?? 0;
}

function artDayBounds(dateStr) {
  const start = new Date(`${dateStr}T00:00:00-03:00`);
  const end = new Date(`${dateStr}T23:59:59.999-03:00`);
  return { start, end };
}

function artMonthBounds(monthStr) {
  const [y, m] = monthStr.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  const start = new Date(`${y}-${mm}-01T00:00:00-03:00`);
  const end = new Date(`${y}-${mm}-${String(lastDay).padStart(2, '0')}T23:59:59.999-03:00`);
  return { start, end };
}

function resolveRange({ period, date, month }) {
  const now = new Date();

  if (period === 'day' && isValidDate(date)) {
    const { start, end } = artDayBounds(date);
    return {
      period: 'day',
      label: date,
      start,
      end,
      date,
      month: null,
    };
  }

  if (period === 'month' && isValidMonth(month)) {
    const { start, end } = artMonthBounds(month);
    return {
      period: 'month',
      label: month,
      start,
      end,
      date: null,
      month,
    };
  }

  if (period === 'all') {
    return {
      period: 'all',
      label: 'Todo',
      start: null,
      end: null,
      date: null,
      month: null,
    };
  }

  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  return {
    period: period === '7d' || period === '90d' ? period : '30d',
    label: period === '7d' ? '7 días' : period === '90d' ? '90 días' : '30 días',
    start: new Date(now.getTime() - days * 24 * 60 * 60 * 1000),
    end: null,
    date: null,
    month: null,
  };
}


function normalizeCancelReason(reason) {
  const raw = String(reason || '').trim();
  if (!raw) return 'Sin motivo';
  return raw
    .replace(/^\[PASSENGER_APP\]\s*/i, '')
    .replace(/^\[AUTO_REQUEUE\]\s*/i, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80);
}

function buildStatistics(trips, range, driversMap = {}) {
  const statusCounts = {};
  const sourceCounts = emptySourceCounts();
  const dailyMap = {};
  const hourlyCounts = Array.from({ length: 24 }, () => 0);
  const weekdayCounts = Array.from({ length: 7 }, () => 0);
  const driverMap = {};
  const cancelReasonMap = {};

  let completed = 0;
  let cancelled = 0;
  let active = 0;
  let totalRevenue = 0;
  let totalCommission = 0;
  let totalDistance = 0;
  let distanceSamples = 0;
  let durationSamples = 0;
  let totalDuration = 0;
  let pricedTrips = 0;
  let completedRevenue = 0;

  const activeStatuses = new Set([
    'pending',
    'queued',
    'scheduled',
    'accepted',
    'going_to_pickup',
    'in_progress',
  ]);

  trips.forEach((trip) => {
    const status = String(trip.status || 'unknown').toLowerCase();
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    const source = detectTripSource(trip.notes);
    sourceCounts[source] = (sourceCounts[source] || 0) + 1;

    if (status === 'completed') completed += 1;
    if (status === 'cancelled') {
      cancelled += 1;
      const reason = normalizeCancelReason(trip.cancel_reason);
      cancelReasonMap[reason] = (cancelReasonMap[reason] || 0) + 1;
    }
    if (activeStatuses.has(status)) active += 1;

    const price = Number(trip.price);
    if (Number.isFinite(price) && price > 0) {
      totalRevenue += price;
      pricedTrips += 1;
      if (status === 'completed') completedRevenue += price;
    }

    const commission = Number(trip.commission_amount);
    if (Number.isFinite(commission) && commission > 0) {
      totalCommission += commission;
    }

    const distance = Number(trip.distance_km);
    if (Number.isFinite(distance) && distance > 0) {
      totalDistance += distance;
      distanceSamples += 1;
    }

    const duration = Number(trip.duration_minutes);
    if (Number.isFinite(duration) && duration > 0) {
      totalDuration += duration;
      durationSamples += 1;
    }

    const createdAt = trip.created_at ? new Date(trip.created_at) : null;
    if (createdAt && !Number.isNaN(createdAt.getTime())) {
      const dayKey = artDayKey(createdAt);
      if (!dailyMap[dayKey]) {
        dailyMap[dayKey] = {
          date: dayKey,
          count: 0,
          completed: 0,
          cancelled: 0,
          revenue: 0,
        };
      }
      dailyMap[dayKey].count += 1;
      if (status === 'completed') dailyMap[dayKey].completed += 1;
      if (status === 'cancelled') dailyMap[dayKey].cancelled += 1;
      if (status === 'completed' && Number.isFinite(price) && price > 0) {
        dailyMap[dayKey].revenue += price;
      }

      hourlyCounts[artHour(createdAt)] += 1;
      weekdayCounts[artWeekday(createdAt)] += 1;
    }

    if (trip.driver_id) {
      if (!driverMap[trip.driver_id]) {
        const driver = driversMap[trip.driver_id] || {};
        driverMap[trip.driver_id] = {
          id: trip.driver_id,
          name: driver.full_name || 'Chofer',
          plate: driver.vehicle_plate || '',
          trips: 0,
          completed: 0,
          cancelled: 0,
          revenue: 0,
        };
      }
      const row = driverMap[trip.driver_id];
      row.trips += 1;
      if (status === 'completed') row.completed += 1;
      if (status === 'cancelled') row.cancelled += 1;
      if (status === 'completed' && Number.isFinite(price) && price > 0) {
        row.revenue += price;
      }
    }
  });

  const total = trips.length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const cancelRate = total > 0 ? Math.round((cancelled / total) * 100) : 0;

  const dailyTrend = Object.values(dailyMap)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((row) => ({
      ...row,
      revenue: Math.round(row.revenue),
    }));

  const peakHour = hourlyCounts.reduce(
    (best, count, hour) => (count > best.count ? { hour, count } : best),
    { hour: 0, count: 0 },
  );

  const peakWeekday = weekdayCounts.reduce(
    (best, count, day) => (count > best.count ? { day, count } : best),
    { day: 0, count: 0 },
  );

  const statusBreakdown = Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({
      status,
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
    }));

  const topDrivers = Object.values(driverMap)
    .sort((a, b) => b.completed - a.completed || b.trips - a.trips)
    .slice(0, 8)
    .map((row) => ({
      ...row,
      revenue: Math.round(row.revenue),
    }));

  const cancelReasons = Object.entries(cancelReasonMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([reason, count]) => ({
      key: reason,
      label: reason,
      count,
    }));

  const locationViews = buildLocationViews(trips, isWithinSaltaCapital);
  const daysWithTrips = dailyTrend.length || 1;

  return {
    period: range.period,
    label: range.label,
    date: range.date,
    month: range.month,
    rangeStart: range.start ? range.start.toISOString() : null,
    rangeEnd: range.end ? range.end.toISOString() : null,
    generatedAt: new Date().toISOString(),
    summary: {
      total,
      completed,
      cancelled,
      active,
      completionRate,
      cancelRate,
      totalRevenue: Math.round(totalRevenue),
      completedRevenue: Math.round(completedRevenue),
      totalCommission: Math.round(totalCommission),
      avgPrice: pricedTrips > 0 ? Math.round(totalRevenue / pricedTrips) : 0,
      avgCompletedPrice: completed > 0 && completedRevenue > 0
        ? Math.round(completedRevenue / completed)
        : 0,
      avgDistanceKm: distanceSamples > 0 ? Number((totalDistance / distanceSamples).toFixed(1)) : 0,
      avgDurationMin: durationSamples > 0 ? Math.round(totalDuration / durationSamples) : 0,
      avgTripsPerDay: Number((total / daysWithTrips).toFixed(1)),
      peakHour: peakHour.count > 0 ? peakHour.hour : null,
      peakHourCount: peakHour.count,
      peakWeekday: peakWeekday.count > 0 ? peakWeekday.day : null,
      peakWeekdayLabel: peakWeekday.count > 0 ? WEEKDAY_LABELS[peakWeekday.day] : null,
      peakWeekdayCount: peakWeekday.count,
    },
    byStatus: statusBreakdown,
    bySource: sourceCounts,
    dailyTrend,
    hourlyDistribution: hourlyCounts.map((count, hour) => ({ hour, count })),
    weekdayDistribution: weekdayCounts.map((count, day) => ({
      day,
      label: WEEKDAY_LABELS[day],
      count,
    })),
    topDrivers,
    cancelReasons,
    locationViews,
    heatmapPoints: locationViews.combined.heatmapPoints,
    topZones: locationViews.combined.topZones,
  };
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const STATS_CACHE_MS = 20_000;
const STATS_PAGE_CONCURRENCY = 6;
const statsCache = new Map();
const statsInflight = new Map();

function statsCacheKey(range) {
  const start = range.start ? Math.floor(range.start.getTime() / 60000) : '';
  const end = range.end ? Math.floor(range.end.getTime() / 60000) : '';
  return `${range.period}|${range.date || ''}|${range.month || ''}|${start}|${end}`;
}

function compactHeatmap(points) {
  const buckets = new Map();
  for (const point of points || []) {
    const lat = Math.round(Number(point.lat) * 1000) / 1000;
    const lng = Math.round(Number(point.lng) * 1000) / 1000;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    const key = `${lat},${lng}`;
    const weight = Number(point.weight) > 0 ? Number(point.weight) : 1;
    const prev = buckets.get(key);
    if (prev) prev.weight += weight;
    else buckets.set(key, { lat, lng, weight });
  }
  return [...buckets.values()];
}

function statsForClient(stats) {
  const { pickup, destination, combined } = stats.locationViews;
  const payload = {
    ...stats,
    locationViews: {
      pickup: { ...pickup, heatmapPoints: compactHeatmap(pickup.heatmapPoints) },
      destination: { ...destination, heatmapPoints: compactHeatmap(destination.heatmapPoints) },
      combined: {
        label: combined.label,
        topZones: combined.topZones,
        pointCount: combined.pointCount,
        tripsWithPoint: combined.tripsWithPoint,
      },
    },
  };
  delete payload.heatmapPoints;
  return payload;
}

async function loadDriverNames(supabase, driverIds) {
  const driversMap = {};
  const chunks = [];
  for (let i = 0; i < driverIds.length; i += 80) chunks.push(driverIds.slice(i, i + 80));
  if (!chunks.length) return driversMap;

  const pages = await Promise.all(chunks.map(async (chunk) => {
    const { data, error } = await supabase
      .from('drivers')
      .select('id, full_name, vehicle_plate')
      .in('id', chunk);
    if (error) throw error;
    return data || [];
  }));

  for (const drivers of pages) {
    for (const driver of drivers) driversMap[driver.id] = driver;
  }
  return driversMap;
}

async function loadTripStatistics(supabase, range) {
  const trips = await fetchAllPages(async (from, to) => {
    let query = supabase
      .from('trips')
      .select(TRIP_SELECT)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to);

    if (range.start) query = query.gte('created_at', range.start.toISOString());
    if (range.end) query = query.lte('created_at', range.end.toISOString());

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }, SUPABASE_PAGE_SIZE, STATS_PAGE_CONCURRENCY);

  const driverIds = [...new Set(trips.map((trip) => trip.driver_id).filter(Boolean))];
  const driversMap = await loadDriverNames(supabase, driverIds);
  return statsForClient(buildStatistics(trips, range, driversMap));
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30d';
    const date = searchParams.get('date') || null;
    const month = searchParams.get('month') || null;
    const fresh = searchParams.get('fresh') === '1';
    const range = resolveRange({ period, date, month });
    const key = statsCacheKey(range);

    if (!fresh) {
      const hit = statsCache.get(key);
      if (hit && hit.expires > Date.now()) {
        return NextResponse.json({ ok: true, data: hit.data });
      }
      const pending = statsInflight.get(key);
      if (pending) {
        return NextResponse.json({ ok: true, data: await pending });
      }
    }

    const job = loadTripStatistics(getSupabaseAdmin(), range).then((data) => {
      statsCache.set(key, { data, expires: Date.now() + STATS_CACHE_MS });
      return data;
    });
    statsInflight.set(key, job);

    try {
      return NextResponse.json({ ok: true, data: await job });
    } finally {
      if (statsInflight.get(key) === job) statsInflight.delete(key);
    }
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
