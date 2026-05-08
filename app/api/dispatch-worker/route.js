import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CRON_SECRET = process.env.CRON_SECRET || '';
const WASENDER_API_KEY = process.env.WASENDER_API_KEY || '';
const WASENDER_BASE_URL = process.env.WASENDER_BASE_URL || 'https://www.wasenderapi.com/api';
const PUSH_NOTIFICATIONS_ENABLED =
  (process.env.WHATSAPP_PUSH_ENABLED || 'true').toLowerCase() !== 'false';

const DISPATCH_BATCH_SIZE = Math.max(
  1,
  Math.round(Number(process.env.DISPATCH_WORKER_BATCH_SIZE || 20) || 20)
);
const DISPATCH_LOCK_SECONDS = Math.max(
  10,
  Math.round(Number(process.env.DISPATCH_WORKER_LOCK_SECONDS || 25) || 25)
);
const DISPATCH_RETRY_SECONDS = Math.max(
  3,
  Math.round(Number(process.env.DISPATCH_WORKER_RETRY_SECONDS || 12) || 12)
);
const DISPATCH_NOTIFY_FAIL_RETRY_SECONDS = Math.max(
  DISPATCH_RETRY_SECONDS,
  Math.round(Number(process.env.DISPATCH_WORKER_NOTIFY_FAIL_RETRY_SECONDS || 45) || 45)
);
const PENDING_ACCEPT_TIMEOUT_MS = Math.max(
  10 * 1000,
  Math.round(Number(process.env.WHATSAPP_PENDING_ACCEPT_TIMEOUT_MS || 15 * 1000) || 15 * 1000)
);

const DRIVER_BUSY_TRIP_STATUSES = ['pending', 'accepted', 'going_to_pickup', 'in_progress'];
const SEARCH_RADII_KM = [1, 2, 3, 4.5, 6, 8, 10, 12, 15, 20];
const NO_PUSH_TOKEN_SCORE_PENALTY_KM = 0.35;
const WORKER_ID = [
  process.env.VERCEL_REGION || 'local',
  process.env.VERCEL_ENV || process.env.NODE_ENV || 'dev',
  process.pid || 'pid',
].join(':');

let supabaseAdmin = null;

function logWorker(stage, meta = {}) {
  try {
    console.info(`[dispatch-worker] ${JSON.stringify({ stage, ...meta })}`);
  } catch {
    // noop
  }
}

function summarizeDbError(error) {
  if (!error) return null;
  return {
    code: error.code || null,
    message: error.message || null,
    details: error.details || null,
    hint: error.hint || null,
  };
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function maskPhone(phone) {
  const normalized = normalizePhone(phone);
  if (!normalized) return null;
  if (normalized.length <= 4) return normalized;
  return `${'*'.repeat(Math.max(0, normalized.length - 4))}${normalized.slice(-4)}`;
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function isVercelCronInvocation({ userAgent = '', xVercelCron = '' } = {}) {
  const ua = String(userAgent || '').toLowerCase();
  const cronHeader = String(xVercelCron || '').toLowerCase();
  return cronHeader === '1' || ua.includes('vercel-cron');
}

function isAuthorizedRequest(req) {
  const authHeader = req.headers.get('authorization') || '';
  const userAgent = req.headers.get('user-agent') || '';
  const xVercelCron = req.headers.get('x-vercel-cron') || '';
  const viaVercelCron = isVercelCronInvocation({ userAgent, xVercelCron });

  if (!CRON_SECRET) {
    return { ok: true, viaVercelCron };
  }

  if (viaVercelCron || authHeader === `Bearer ${CRON_SECRET}`) {
    return { ok: true, viaVercelCron };
  }

  return { ok: false, viaVercelCron };
}

function getSupabaseAdmin() {
  if (supabaseAdmin) return supabaseAdmin;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  supabaseAdmin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return supabaseAdmin;
}

function getAllowedRadiiKm(attemptNo) {
  const normalizedAttempt = Math.max(1, Math.round(Number(attemptNo) || 1));
  const maxIndex = Math.min(SEARCH_RADII_KM.length - 1, normalizedAttempt);
  return SEARCH_RADII_KM.slice(0, maxIndex + 1);
}

async function releaseDispatchClaim({
  tripId,
  lockToken,
  result = 'retry',
  retrySeconds = DISPATCH_RETRY_SECONDS,
  errorCode = null,
  errorText = null,
  selectedDriverId = null,
  selectedDistanceKm = null,
  selectedScore = null,
} = {}) {
  if (!tripId || !lockToken) return false;

  const safeRetrySeconds = Math.max(1, Math.round(Number(retrySeconds) || DISPATCH_RETRY_SECONDS));
  const { data, error } = await getSupabaseAdmin().rpc('release_dispatch_claim', {
    p_trip_id: tripId,
    p_lock_token: lockToken,
    p_result: String(result || 'retry').toLowerCase(),
    p_retry_seconds: safeRetrySeconds,
    p_error_code: errorCode ? String(errorCode).slice(0, 80) : null,
    p_error_text: errorText ? String(errorText).slice(0, 400) : null,
    p_selected_driver: selectedDriverId || null,
    p_selected_distance_km: Number.isFinite(Number(selectedDistanceKm))
      ? Number(selectedDistanceKm)
      : null,
    p_selected_score: Number.isFinite(Number(selectedScore)) ? Number(selectedScore) : null,
  });

  if (error) {
    logWorker('release_claim_error', {
      tripId,
      result,
      error: summarizeDbError(error),
    });
    return false;
  }

  return Boolean(data);
}

async function setDispatchQueueRetry(tripId, retrySeconds, reason = 'retry') {
  if (!tripId) return;

  const retryAt = new Date(Date.now() + Math.max(1, retrySeconds) * 1000).toISOString();
  const { error } = await getSupabaseAdmin()
    .from('dispatch_queue')
    .update({
      next_attempt_at: retryAt,
      last_error_code: 'retry',
      last_error: String(reason || 'retry').slice(0, 400),
      updated_at: new Date().toISOString(),
    })
    .eq('trip_id', tripId)
    .eq('queue_status', 'queued');

  if (error) {
    logWorker('set_queue_retry_error', {
      tripId,
      error: summarizeDbError(error),
    });
  }
}

async function expireTimedOutPendingTrips() {
  const cutoff = new Date(Date.now() - PENDING_ACCEPT_TIMEOUT_MS).toISOString();

  const { data, error } = await getSupabaseAdmin()
    .from('trips')
    .update({
      driver_id: null,
      origin_address: null,
      origin_lat: null,
      origin_lng: null,
      status: 'queued',
      assigned_at: null,
      accepted_at: null,
    })
    .eq('status', 'pending')
    .not('assigned_at', 'is', null)
    .lt('assigned_at', cutoff)
    .select('id');

  if (error) {
    logWorker('expire_pending_error', { error: summarizeDbError(error) });
    return { expired: 0, error: true };
  }

  const expired = Array.isArray(data) ? data.length : 0;
  if (expired > 0) {
    logWorker('expire_pending_done', { expired });
  }

  return { expired, error: false };
}

async function claimDispatchBatch() {
  const { data, error } = await getSupabaseAdmin().rpc('claim_dispatch_queue_batch', {
    p_worker: WORKER_ID,
    p_limit: DISPATCH_BATCH_SIZE,
    p_lock_seconds: DISPATCH_LOCK_SECONDS,
  });

  if (error) {
    logWorker('claim_batch_error', { error: summarizeDbError(error) });
    throw error;
  }

  return Array.isArray(data) ? data : [];
}

async function chooseDriverForClaim(trip, { attemptNo = 1 } = {}) {
  const pickupLat = Number(trip.destination_lat);
  const pickupLng = Number(trip.destination_lng);
  if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) {
    return null;
  }

  const passengerPhone = normalizePhone(trip.passenger_phone || '');

  const { data: drivers, error } = await getSupabaseAdmin()
    .from('drivers')
    .select('id, full_name, phone, push_token, current_lat, current_lng, is_available')
    .eq('is_available', true);

  if (error) throw error;

  const withCoords = (drivers || []).filter(
    (driver) => Number.isFinite(Number(driver.current_lat)) && Number.isFinite(Number(driver.current_lng))
  );

  const withoutSamePhone = passengerPhone
    ? withCoords.filter((driver) => normalizePhone(driver.phone || '') !== passengerPhone)
    : withCoords;

  if (!withoutSamePhone.length) return null;

  const driverIds = withoutSamePhone.map((driver) => driver.id).filter(Boolean);
  if (!driverIds.length) return null;

  const { data: activeTrips, error: activeTripsError } = await getSupabaseAdmin()
    .from('trips')
    .select('driver_id, status')
    .in('driver_id', driverIds)
    .in('status', DRIVER_BUSY_TRIP_STATUSES);

  if (activeTripsError) throw activeTripsError;

  const busyDriverIds = new Set((activeTrips || []).map((item) => item.driver_id).filter(Boolean));
  const candidateDrivers = withoutSamePhone.filter((driver) => !busyDriverIds.has(driver.id));
  if (!candidateDrivers.length) return null;

  const scored = candidateDrivers
    .map((driver) => {
      const distanceKm = haversineKm(
        Number(driver.current_lat),
        Number(driver.current_lng),
        pickupLat,
        pickupLng
      );
      const pushPenaltyKm = driver.push_token ? 0 : NO_PUSH_TOKEN_SCORE_PENALTY_KM;
      const scoreKm = distanceKm + pushPenaltyKm;
      return {
        driver,
        distanceKm,
        scoreKm,
      };
    })
    .sort((a, b) => {
      if (a.scoreKm !== b.scoreKm) return a.scoreKm - b.scoreKm;
      return a.distanceKm - b.distanceKm;
    });

  const allowedRadiiKm = getAllowedRadiiKm(attemptNo);
  for (const radiusKm of allowedRadiiKm) {
    const inRadius = scored.filter((item) => item.distanceKm <= radiusKm);
    if (inRadius.length > 0) {
      return {
        ...inRadius[0],
        radiusKm,
        allowedRadiiKm,
      };
    }
  }

  return null;
}

async function sendPushNotification(pushToken, payload) {
  const token = String(pushToken || '').trim();
  if (!token) return { ok: false, reason: 'no_push_token' };

  const tokenLooksValid = /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token);
  if (!tokenLooksValid) {
    return { ok: false, reason: 'invalid_push_token_format' };
  }

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        to: token,
        title: payload.title,
        body: payload.body,
        data: payload.data || {},
        sound: 'default',
        priority: 'high',
        channelId: 'trips',
      }),
    });

    const result = await response.json().catch(() => null);
    const ticket = Array.isArray(result?.data) ? result.data[0] : result?.data;

    if (!response.ok || ticket?.status === 'error') {
      return {
        ok: false,
        reason: ticket?.details?.error || ticket?.message || 'push_error',
      };
    }

    return { ok: true, ticketId: ticket?.id || null };
  } catch (error) {
    return { ok: false, reason: error?.message || 'push_exception' };
  }
}

async function sendWhatsAppText(phone, text) {
  const normalized = normalizePhone(phone);
  if (!normalized) return { ok: false, reason: 'invalid_driver_phone' };
  if (!WASENDER_API_KEY) return { ok: false, reason: 'missing_wasender_api_key' };

  const response = await fetch(`${WASENDER_BASE_URL}/send-message`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WASENDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to: `${normalized}@s.whatsapp.net`, text }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    return {
      ok: false,
      reason: `whatsapp_send_error:${body.slice(0, 120) || response.status}`,
    };
  }

  return { ok: true };
}

async function notifyDriver(driver, trip) {
  const passengerPhone = normalizePhone(trip?.passenger_phone || '');
  const driverPhone = normalizePhone(driver?.phone || '');

  if (passengerPhone && driverPhone && passengerPhone === driverPhone) {
    return { ok: false, reason: 'driver_phone_matches_passenger' };
  }

  if (PUSH_NOTIFICATIONS_ENABLED && driver?.push_token) {
    const pushResult = await sendPushNotification(driver.push_token, {
      title: 'Nuevo viaje asignado',
      body: `${trip.passenger_name || 'Pasajero'} -> ${trip.destination_address || 'Retiro'}`,
      data: {
        type: 'new_trip',
        tripId: trip.id,
        passengerPhone,
      },
    });

    if (pushResult.ok) {
      return { ok: true, channel: 'push', reason: 'push_ok' };
    }
  }

  if (!driverPhone) {
    return { ok: false, reason: 'no_driver_channel' };
  }

  const whatsappResult = await sendWhatsAppText(
    driverPhone,
    [
      '🚖 *Nuevo viaje asignado*',
      trip.passenger_name ? `Pasajero: *${trip.passenger_name}*` : null,
      trip.destination_address ? `Retiro: *${trip.destination_address}*` : null,
      '',
      'Abrí la app para verlo.',
    ]
      .filter(Boolean)
      .join('\n')
  );

  if (!whatsappResult.ok) {
    return { ok: false, reason: whatsappResult.reason || 'whatsapp_send_error' };
  }

  return { ok: true, channel: 'whatsapp', reason: 'push_failed_whatsapp_ok' };
}

async function requeuePendingTripAfterNotifyFailure(tripId, notifyReason = 'notify_failed') {
  const { data, error } = await getSupabaseAdmin()
    .from('trips')
    .update({
      driver_id: null,
      origin_address: null,
      origin_lat: null,
      origin_lng: null,
      status: 'queued',
      assigned_at: null,
      accepted_at: null,
      cancel_reason: `[AUTO_REQUEUE] Falla de notificacion: ${String(notifyReason).slice(0, 140)}`,
    })
    .eq('id', tripId)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();

  if (error) {
    logWorker('requeue_notify_fail_error', {
      tripId,
      notifyReason,
      error: summarizeDbError(error),
    });
    return false;
  }

  return Boolean(data?.id);
}

async function processDispatchClaim(claim) {
  const tripId = claim?.trip_id;
  const lockToken = claim?.lock_token;
  const attemptNo = Math.max(1, Math.round(Number(claim?.attempt_no) || 1));

  if (!tripId || !lockToken) {
    return { status: 'invalid_claim' };
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('id, status, passenger_name, passenger_phone, destination_address, destination_lat, destination_lng')
      .eq('id', tripId)
      .maybeSingle();

    if (tripError) throw tripError;

    if (!trip) {
      await releaseDispatchClaim({
        tripId,
        lockToken,
        result: 'done',
        errorCode: 'trip_not_found',
      });
      return { status: 'trip_not_found' };
    }

    if (String(trip.status || '').toLowerCase() !== 'queued') {
      await releaseDispatchClaim({
        tripId,
        lockToken,
        result: 'done',
        errorCode: `trip_status_${trip.status || 'unknown'}`,
      });
      return { status: 'trip_not_queued' };
    }

    const pickupLat = Number(trip.destination_lat);
    const pickupLng = Number(trip.destination_lng);
    if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) {
      await releaseDispatchClaim({
        tripId,
        lockToken,
        result: 'retry',
        retrySeconds: 90,
        errorCode: 'missing_pickup_coordinates',
      });
      return { status: 'missing_pickup_coordinates' };
    }

    const driverSelection = await chooseDriverForClaim(trip, { attemptNo });
    if (!driverSelection?.driver) {
      await releaseDispatchClaim({
        tripId,
        lockToken,
        result: 'retry',
        retrySeconds: DISPATCH_RETRY_SECONDS,
        errorCode: 'no_driver_available',
      });
      return { status: 'no_driver_available' };
    }

    const selectedDriver = driverSelection.driver;
    const assignedAt = new Date().toISOString();

    const { data: assignedTrip, error: assignError } = await supabase
      .from('trips')
      .update({
        driver_id: selectedDriver.id,
        origin_address: `${Number(selectedDriver.current_lat).toFixed(5)}, ${Number(selectedDriver.current_lng).toFixed(5)}`,
        origin_lat: Number(selectedDriver.current_lat),
        origin_lng: Number(selectedDriver.current_lng),
        status: 'pending',
        assigned_at: assignedAt,
      })
      .eq('id', tripId)
      .eq('status', 'queued')
      .select('id, passenger_name, passenger_phone, destination_address')
      .maybeSingle();

    if (assignError) throw assignError;

    if (!assignedTrip) {
      await releaseDispatchClaim({
        tripId,
        lockToken,
        result: 'done',
        errorCode: 'trip_claim_lost',
      });
      return { status: 'trip_claim_lost' };
    }

    const notifyResult = await notifyDriver(
      selectedDriver,
      {
        ...trip,
        ...assignedTrip,
      }
    );

    if (!notifyResult?.ok) {
      await requeuePendingTripAfterNotifyFailure(tripId, notifyResult?.reason || 'notify_failed');
      await setDispatchQueueRetry(
        tripId,
        DISPATCH_NOTIFY_FAIL_RETRY_SECONDS,
        `notify_failed:${notifyResult?.reason || 'unknown'}`
      );
      await releaseDispatchClaim({
        tripId,
        lockToken,
        result: 'retry',
        retrySeconds: DISPATCH_NOTIFY_FAIL_RETRY_SECONDS,
        errorCode: 'notify_failed',
        errorText: notifyResult?.reason || 'unknown',
      });

      return { status: 'notify_failed', notifyReason: notifyResult?.reason || 'unknown' };
    }

    await releaseDispatchClaim({
      tripId,
      lockToken,
      result: 'done',
      selectedDriverId: selectedDriver.id,
      selectedDistanceKm: driverSelection.distanceKm,
      selectedScore: driverSelection.scoreKm,
    });

    return {
      status: 'assigned',
      driverId: selectedDriver.id,
      channel: notifyResult.channel || null,
      distanceKm: Number(driverSelection.distanceKm.toFixed(3)),
      scoreKm: Number(driverSelection.scoreKm.toFixed(3)),
      searchRadiusKm: driverSelection.radiusKm,
      attemptNo,
      passengerPhone: maskPhone(trip.passenger_phone),
    };
  } catch (error) {
    await releaseDispatchClaim({
      tripId,
      lockToken,
      result: 'retry',
      retrySeconds: DISPATCH_RETRY_SECONDS,
      errorCode: 'worker_exception',
      errorText: error?.message || 'unknown',
    });

    logWorker('claim_process_error', {
      tripId,
      error: error?.message || 'unknown',
    });

    return { status: 'error', error: error?.message || 'unknown' };
  }
}

async function runDispatchWorkerCycle() {
  const expireResult = await expireTimedOutPendingTrips();
  const claimedItems = await claimDispatchBatch();

  const summary = {
    workerId: WORKER_ID,
    claimed: claimedItems.length,
    assigned: 0,
    noDriver: 0,
    notifyFailed: 0,
    skipped: 0,
    errors: 0,
    expiredPending: expireResult.expired || 0,
    results: [],
  };

  for (const claim of claimedItems) {
    const result = await processDispatchClaim(claim);
    summary.results.push({ tripId: claim?.trip_id || null, ...result });

    if (result.status === 'assigned') summary.assigned += 1;
    else if (result.status === 'no_driver_available') summary.noDriver += 1;
    else if (result.status === 'notify_failed') summary.notifyFailed += 1;
    else if (result.status === 'error') summary.errors += 1;
    else summary.skipped += 1;
  }

  logWorker('cycle_done', {
    claimed: summary.claimed,
    assigned: summary.assigned,
    noDriver: summary.noDriver,
    notifyFailed: summary.notifyFailed,
    skipped: summary.skipped,
    errors: summary.errors,
    expiredPending: summary.expiredPending,
  });

  return summary;
}

export async function GET(req) {
  try {
    const auth = isAuthorizedRequest(req);
    if (!auth.ok) {
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const summary = await runDispatchWorkerCycle();
    return NextResponse.json(
      {
        ok: true,
        viaVercelCron: auth.viaVercelCron,
        summary,
      },
      { status: 200 }
    );
  } catch (error) {
    logWorker('worker_fatal_error', {
      error: error?.message || 'unknown',
    });
    return NextResponse.json(
      {
        ok: false,
        error: {
          message: error?.message || 'Unexpected worker error',
        },
      },
      { status: 500 }
    );
  }
}
