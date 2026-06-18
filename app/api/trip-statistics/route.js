import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isWithinSaltaCapital } from '../../../src/lib/constants';
import { buildLocationViews } from '../../../src/lib/tripLocationStats';

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
  'completed_at',
  'notes',
  'driver_id',
].join(', ');

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

function periodToSince(period) {
  const now = new Date();
  switch (period) {
    case '7d':
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case '90d':
      return new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    case 'all':
      return null;
    case '30d':
    default:
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

function detectTripSource(notes) {
  const text = String(notes || '').toLowerCase();
  if (text.includes('[dashboard_assign]')) return 'dashboard';
  if (text.includes('whatsapp')) return 'whatsapp';
  return 'otro';
}

function buildStatistics(trips, period) {
  const statusCounts = {};
  const sourceCounts = { whatsapp: 0, dashboard: 0, otro: 0 };
  const dailyMap = {};
  const hourlyCounts = Array.from({ length: 24 }, () => 0);

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

  const activeStatuses = new Set(['pending', 'queued', 'scheduled', 'accepted', 'going_to_pickup', 'in_progress']);

  trips.forEach((trip) => {
    const status = String(trip.status || 'unknown').toLowerCase();
    statusCounts[status] = (statusCounts[status] || 0) + 1;

    const source = detectTripSource(trip.notes);
    sourceCounts[source] += 1;

    if (status === 'completed') completed += 1;
    if (status === 'cancelled') cancelled += 1;
    if (activeStatuses.has(status)) active += 1;

    const price = Number(trip.price);
    if (Number.isFinite(price) && price > 0) {
      totalRevenue += price;
      pricedTrips += 1;
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
      const dayKey = createdAt.toISOString().slice(0, 10);
      dailyMap[dayKey] = (dailyMap[dayKey] || 0) + 1;
      hourlyCounts[createdAt.getHours()] += 1;
    }
  });

  const total = trips.length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;
  const cancelRate = total > 0 ? Math.round((cancelled / total) * 100) : 0;

  const dailyTrend = Object.entries(dailyMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  const peakHour = hourlyCounts.reduce(
    (best, count, hour) => (count > best.count ? { hour, count } : best),
    { hour: 0, count: 0 },
  );

  const statusBreakdown = Object.entries(statusCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([status, count]) => ({
      status,
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
    }));

  const locationViews = buildLocationViews(trips, isWithinSaltaCapital);

  return {
    period,
    generatedAt: new Date().toISOString(),
    summary: {
      total,
      completed,
      cancelled,
      active,
      completionRate,
      cancelRate,
      totalRevenue: Math.round(totalRevenue),
      totalCommission: Math.round(totalCommission),
      avgPrice: pricedTrips > 0 ? Math.round(totalRevenue / pricedTrips) : 0,
      avgDistanceKm: distanceSamples > 0 ? Number((totalDistance / distanceSamples).toFixed(1)) : 0,
      avgDurationMin: durationSamples > 0 ? Math.round(totalDuration / durationSamples) : 0,
      peakHour: peakHour.count > 0 ? peakHour.hour : null,
      peakHourCount: peakHour.count,
    },
    byStatus: statusBreakdown,
    bySource: sourceCounts,
    dailyTrend,
    hourlyDistribution: hourlyCounts.map((count, hour) => ({ hour, count })),
    locationViews,
    heatmapPoints: locationViews.combined.heatmapPoints,
    topZones: locationViews.combined.topZones,
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const period = searchParams.get('period') || '30d';
    const since = periodToSince(period);

    const supabase = getSupabaseAdmin();
    let query = supabase
      .from('trips')
      .select(TRIP_SELECT)
      .order('created_at', { ascending: false })
      .limit(5000);

    if (since) {
      query = query.gte('created_at', since.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;

    const stats = buildStatistics(data || [], period);

    return NextResponse.json({ ok: true, data: stats });
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
