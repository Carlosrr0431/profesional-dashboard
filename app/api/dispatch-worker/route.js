import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getFirebaseMessagingClient,
  isFirebaseCredentialError,
  isLegacyExpoPushToken,
  isLikelyFcmToken,
  normalizeFcmDataPayload,
  normalizeFirebaseSendError,
} from '../../../src/lib/firebaseAdmin';
import {
  DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS,
  promoteDueScheduledTrips,
} from '../../../src/lib/promoteDueScheduledTrips';
import {
  buildPendingToQueuedUpdate,
  canRequeuePendingTrip,
  resolveDispatchPickupCoords,
} from '../../../src/lib/tripRequeue';
import { isPassengerInitiatedCancellation } from '../../../src/lib/passengerTripCancel';
import { isPassengerAppTrip, shouldPreservePickupOriginOnAssign } from '../../../shared/trip-contract.js';
import { trySendPassengerAppTripPush } from '../../../src/lib/passengerPushNotifications';
import {
  MAX_DRIVER_OFFER_ATTEMPTS,
  buildWaContextAfterNotifyFailure,
  buildWaContextWithExcludedDriver,
  canResetTimeoutRoundExclusions,
  clearTimeoutRoundExclusions,
  getActiveDispatchExcludedDriverIds,
  getDispatchDriverOfferCounts,
  getTripDispatchExcludedDriverIds,
  normalizeDispatchExclusionState,
} from '../../../src/lib/dispatchExclusions';
import {
  validateCronAuth,
} from '../../../src/lib/cronAuth';
import { expandBusyDriverIdsToFleet } from '../../../src/lib/fleetDispatch';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const CRON_SECRET = process.env.CRON_SECRET || '';
const WASENDER_API_KEY = process.env.WASENDER_API_KEY || '';
const WASENDER_BASE_URL = process.env.WASENDER_BASE_URL || 'https://www.wasenderapi.com/api';
const DRIVER_APP_DEEPLINK_BASE = process.env.DRIVER_APP_DEEPLINK_BASE || 'exp+driver-app://open';
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
  Math.round(Number(process.env.DISPATCH_WORKER_RETRY_SECONDS || 20) || 20)
);
const DISPATCH_NOTIFY_FAIL_RETRY_SECONDS = Math.max(
  DISPATCH_RETRY_SECONDS,
  Math.round(Number(process.env.DISPATCH_WORKER_NOTIFY_FAIL_RETRY_SECONDS || 45) || 45)
);
// Alineado con Agente_IA (60s) y driver-app TRIP_ACCEPT_TIMEOUT.
// 15s era demasiado corto: el worker reencolaba antes de que el chofer tocara Aceptar.
const DEFAULT_PENDING_ACCEPT_TIMEOUT_MS = 60 * 1000;
const MIN_PENDING_ACCEPT_TIMEOUT_MS = 20 * 1000;
const MAX_PENDING_ACCEPT_TIMEOUT_MS = 5 * 60 * 1000;
const configuredPendingAcceptTimeoutMs = Number(
  process.env.WHATSAPP_PENDING_ACCEPT_TIMEOUT_MS || DEFAULT_PENDING_ACCEPT_TIMEOUT_MS
);
const PENDING_ACCEPT_TIMEOUT_MS = Number.isFinite(configuredPendingAcceptTimeoutMs)
  ? Math.max(
    MIN_PENDING_ACCEPT_TIMEOUT_MS,
    Math.min(MAX_PENDING_ACCEPT_TIMEOUT_MS, Math.round(configuredPendingAcceptTimeoutMs))
  )
  : DEFAULT_PENDING_ACCEPT_TIMEOUT_MS;

const DRIVER_BUSY_TRIP_STATUSES = ['pending', 'accepted', 'going_to_pickup', 'in_progress'];
const MAX_DISPATCH_ATTEMPTS = Number(process.env.DISPATCH_MAX_ATTEMPTS || 30);
const SEARCH_RADII_KM = [1, 2, 3, 4.5, 6, 8, 10];
const DEFAULT_SEARCH_EXPANSION_INTERVAL_MS = 30 * 1000;
const configuredSearchExpansionIntervalMs = Number(
  process.env.DISPATCH_WORKER_SEARCH_EXPANSION_INTERVAL_MS
    || process.env.WHATSAPP_DRIVER_SEARCH_EXPANSION_INTERVAL_MS
    || DEFAULT_SEARCH_EXPANSION_INTERVAL_MS
);
const SEARCH_EXPANSION_INTERVAL_MS = Number.isFinite(configuredSearchExpansionIntervalMs)
  ? Math.max(5 * 1000, Math.round(configuredSearchExpansionIntervalMs))
  : DEFAULT_SEARCH_EXPANSION_INTERVAL_MS;
const NO_PUSH_TOKEN_SCORE_PENALTY_KM = 0.35;
const SALTA_CAPITAL_CENTER = { lat: -24.78, lng: -65.42 };
const DISPATCH_MAX_PICKUP_DISTANCE_FROM_CENTER_KM = Math.max(
  10,
  Math.round(Number(process.env.DISPATCH_MAX_PICKUP_DISTANCE_FROM_CENTER_KM || 80) || 80)
);
const WORKER_ID = [
  process.env.VERCEL_REGION || 'local',
  process.env.VERCEL_ENV || process.env.NODE_ENV || 'dev',
  process.pid || 'pid',
].join(':');
const DISPATCH_VERBOSE_LOGS =
  (process.env.DISPATCH_WORKER_VERBOSE_LOGS || 'true').toLowerCase() !== 'false';
const PUSH_PROVIDER_BACKOFF_MS = Math.max(
  60 * 1000,
  Math.round(Number(process.env.WHATSAPP_PUSH_PROVIDER_BACKOFF_MS || 10 * 60 * 1000) || 10 * 60 * 1000)
);
const SCHEDULED_DISPATCH_AHEAD_MS = Math.max(
  0,
  Math.round(
    Number(process.env.SCHEDULED_DISPATCH_AHEAD_MS || DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS)
      || DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS
  )
);

let supabaseAdmin = null;
let pushProviderBackoffUntil = 0;

function logWorker(stage, meta = {}) {
  try {
    console.info(`[dispatch-worker] ${JSON.stringify({ stage, ...meta })}`);
  } catch {
    // noop
  }
}

function logWorkerVerbose(stage, meta = {}) {
  if (!DISPATCH_VERBOSE_LOGS) return;
  logWorker(stage, meta);
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

function isPushCredentialsIssue(reason) {
  return isFirebaseCredentialError(reason);
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

function safeJsonParse(value, fallback = {}) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
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

function getPickupDistanceFromOperationCenterKm(lat, lng) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  return haversineKm(
    Number(lat),
    Number(lng),
    SALTA_CAPITAL_CENTER.lat,
    SALTA_CAPITAL_CENTER.lng
  );
}

function isAuthorizedRequest(req) {
  const url = new URL(req.url);
  return validateCronAuth({
    headers: req.headers,
    searchParams: url.searchParams,
    cronSecret: CRON_SECRET,
  });
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

function computeQueueAgeMs(enqueuedAt) {
  const timestamp = Date.parse(String(enqueuedAt || ''));
  if (!Number.isFinite(timestamp)) return null;
  const ageMs = Date.now() - timestamp;
  if (!Number.isFinite(ageMs)) return null;
  return Math.max(0, Math.round(ageMs));
}

function getEffectiveAttemptNo(attemptNo, queueAgeMs = null, excludedDriverCount = 0) {
  const normalizedAttempt = Math.max(1, Math.round(Number(attemptNo) || 1));
  let effective = normalizedAttempt;

  if (Number.isFinite(Number(queueAgeMs))) {
    const expansionStepsByAge = Math.floor(Number(queueAgeMs) / SEARCH_EXPANSION_INTERVAL_MS);
    effective = Math.max(effective, Math.max(1, expansionStepsByAge + 1));
  }

  const normalizedExcluded = Math.max(0, Math.round(Number(excludedDriverCount) || 0));
  if (normalizedExcluded > 0) {
    effective = Math.max(
      effective,
      Math.min(SEARCH_RADII_KM.length, 1 + normalizedExcluded),
    );
  }

  return effective;
}

function getAllowedRadiiKm(attemptNo) {
  const normalizedAttempt = Math.max(1, Math.round(Number(attemptNo) || 1));
  const maxIndex = Math.min(SEARCH_RADII_KM.length - 1, normalizedAttempt);
  return SEARCH_RADII_KM.slice(0, maxIndex + 1);
}

function buildRadiusExpansionHint({
  pickupLat,
  pickupLng,
  allowedRadii,
  drivers,
  excludedDriverIds,
  busyDriverIds,
}) {
  if (!Array.isArray(allowedRadii) || allowedRadii.length === 0) return null;
  if (!Number.isFinite(Number(pickupLat)) || !Number.isFinite(Number(pickupLng))) return null;

  const maxAllowedRadius = allowedRadii[allowedRadii.length - 1];
  let nearestBeyondKm = null;

  for (const driver of drivers || []) {
    if (!driver?.id) continue;
    if (excludedDriverIds.has(driver.id)) continue;
    if (busyDriverIds.has(driver.id)) continue;
    if (!hasDriverNotificationChannel(driver)) continue;

    const distanceKm = haversineKm(
      Number(driver.current_lat),
      Number(driver.current_lng),
      pickupLat,
      pickupLng,
    );
    if (distanceKm <= maxAllowedRadius) continue;

    if (nearestBeyondKm == null || distanceKm < nearestBeyondKm) {
      nearestBeyondKm = distanceKm;
    }
  }

  if (nearestBeyondKm == null) return null;

  return {
    expandRadius: true,
    nearestBeyondKm,
    maxAllowedRadius,
  };
}

function hasDriverNotificationChannel(driver) {
  const hasPush = PUSH_NOTIFICATIONS_ENABLED && isLikelyFcmToken(driver?.push_token);
  const hasWhatsApp = normalizePhone(driver?.phone || '').length >= 8;
  return hasPush || hasWhatsApp;
}

function buildDriverAppDeepLink(tripId) {
  const base = String(DRIVER_APP_DEEPLINK_BASE || '').trim();
  if (!base) return null;

  const safeTripId = String(tripId || '').trim();
  if (!safeTripId) return base;

  if (base.includes('{tripId}')) {
    return base.replace('{tripId}', encodeURIComponent(safeTripId));
  }

  if (/[?&]tripId=/.test(base)) {
    return base;
  }

  const joiner = base.includes('?') ? '&' : '?';
  return `${base}${joiner}tripId=${encodeURIComponent(safeTripId)}`;
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

/**
 * El trigger sync_dispatch_queue_from_trips pone next_attempt_at=NOW() y
 * next_dispatch_at=NOW() al pasar a queued, pisando el backoff del expire.
 * Restaurar ambos para no re-claimar el mismo viaje en el mismo ciclo.
 */
async function restoreDispatchBackoffAfterRequeue(tripId, nextDispatchAt, reason = 'requeue_backoff') {
  if (!tripId || !nextDispatchAt) return;

  const supabase = getSupabaseAdmin();
  const { error: queueError } = await supabase
    .from('dispatch_queue')
    .update({
      next_attempt_at: nextDispatchAt,
      queue_status: 'queued',
      lock_token: null,
      lock_owner: null,
      lock_acquired_at: null,
      lock_expires_at: null,
      last_error_code: 'retry',
      last_error: String(reason || 'requeue_backoff').slice(0, 400),
      updated_at: new Date().toISOString(),
    })
    .eq('trip_id', tripId);

  if (queueError) {
    logWorker('restore_queue_backoff_error', {
      tripId,
      error: summarizeDbError(queueError),
    });
  }

  const { error: tripError } = await supabase
    .from('trips')
    .update({ next_dispatch_at: nextDispatchAt })
    .eq('id', tripId)
    .eq('status', 'queued');

  if (tripError) {
    logWorker('restore_trip_backoff_error', {
      tripId,
      error: summarizeDbError(tripError),
    });
  }
}

async function expireTimedOutPendingTrips() {
  const cutoff = new Date(Date.now() - PENDING_ACCEPT_TIMEOUT_MS).toISOString();
  const supabase = getSupabaseAdmin();

  // Caso normal: viajes pending con assigned_at vencido.
  const { data: staleAssigned, error: staleAssignedError } = await supabase
    .from('trips')
    .select('id, assigned_at')
    .eq('status', 'pending')
    .not('assigned_at', 'is', null)
    .lt('assigned_at', cutoff);

  if (staleAssignedError) {
    logWorker('expire_pending_candidates_error', {
      scope: 'assigned_at',
      error: summarizeDbError(staleAssignedError),
    });
    return { expired: 0, error: true };
  }

  // Fail-safe: pending sin assigned_at y viejo por status_updated_at.
  const { data: staleWithoutAssigned, error: staleWithoutAssignedError } = await supabase
    .from('trips')
    .select('id, status_updated_at')
    .eq('status', 'pending')
    .is('assigned_at', null)
    .lt('status_updated_at', cutoff);

  if (staleWithoutAssignedError) {
    logWorker('expire_pending_candidates_error', {
      scope: 'status_updated_at',
      error: summarizeDbError(staleWithoutAssignedError),
    });
    return { expired: 0, error: true };
  }

  // Último fail-safe: filas legacy sin assigned_at ni status_updated_at.
  const { data: staleLegacyPending, error: staleLegacyPendingError } = await supabase
    .from('trips')
    .select('id, created_at')
    .eq('status', 'pending')
    .is('assigned_at', null)
    .is('status_updated_at', null)
    .lt('created_at', cutoff);

  if (staleLegacyPendingError) {
    logWorker('expire_pending_candidates_error', {
      scope: 'created_at_legacy',
      error: summarizeDbError(staleLegacyPendingError),
    });
    return { expired: 0, error: true };
  }

  const candidateIds = [
    ...(staleAssigned || []).map((row) => row?.id).filter(Boolean),
    ...(staleWithoutAssigned || []).map((row) => row?.id).filter(Boolean),
    ...(staleLegacyPending || []).map((row) => row?.id).filter(Boolean),
  ].filter((id, index, arr) => arr.indexOf(id) === index);

  logWorkerVerbose('expire_pending_candidates', {
    cutoff,
    withAssignedCount: (staleAssigned || []).length,
    withoutAssignedCount: (staleWithoutAssigned || []).length,
    legacyPendingCount: (staleLegacyPending || []).length,
    candidateCount: candidateIds.length,
    candidateTripIds: candidateIds,
  });

  if (!candidateIds.length) {
    return { expired: 0, error: false };
  }

  const { data: expiredRows, error: expireError } = await supabase
    .from('trips')
    .select('id, status, cancel_reason, driver_id, wa_context, dispatch_attempts, notes, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng')
    .in('id', candidateIds)
    .eq('status', 'pending');

  const tripsToExpire = Array.isArray(expiredRows) ? expiredRows : [];

  if (expireError) {
    logWorker('expire_pending_error', {
      candidateCount: candidateIds.length,
      error: summarizeDbError(expireError),
    });
    return { expired: 0, error: true };
  }

  let expired = 0;
  for (const t of tripsToExpire) {
    if (!canRequeuePendingTrip(t)) {
      logWorkerVerbose('expire_pending_skip_not_requeueable', {
        tripId: t.id,
        status: t.status || null,
        cancelReason: t.cancel_reason || null,
      });
      continue;
    }

    const currentAttempts = Number(t.dispatch_attempts || 0);
    const newAttempts = currentAttempts + 1;
    const delaySec = Math.min(180, 30 * Math.pow(1.5, newAttempts));
    const nextDispatchAt = new Date(Date.now() + delaySec * 1000).toISOString();
    const excludedDriverId = String(t.driver_id || '').trim() || null;
    const updatedWaContext = excludedDriverId
      ? buildWaContextWithExcludedDriver(t.wa_context, excludedDriverId, 'pending_accept_timeout')
      : safeJsonParse(t.wa_context, {});

    const { error: upErr } = await getSupabaseAdmin()
      .from('trips')
      .update(buildPendingToQueuedUpdate(t, {
        dispatch_attempts: newAttempts,
        next_dispatch_at: nextDispatchAt,
        wa_context: updatedWaContext,
        cancel_reason: excludedDriverId
          ? `[AUTO_REQUEUE] Sin respuesta del chofer ${excludedDriverId.slice(0, 8)}`
          : '[AUTO_REQUEUE] Sin respuesta del chofer',
      }))
      .eq('id', t.id)
      .eq('status', 'pending');

    if (!upErr) {
      await restoreDispatchBackoffAfterRequeue(
        t.id,
        nextDispatchAt,
        'pending_accept_timeout'
      );
      expired += 1;
      if (excludedDriverId) {
        logWorkerVerbose('expire_pending_excluded_driver', {
          tripId: t.id,
          driverId: excludedDriverId,
          excludedCount: getTripDispatchExcludedDriverIds(updatedWaContext).length,
          driverOfferCount: getDispatchDriverOfferCounts(updatedWaContext)[excludedDriverId] || null,
          maxDriverOfferAttempts: MAX_DRIVER_OFFER_ATTEMPTS,
          nextDispatchAt,
        });
      }
    }
  }

  logWorker('expire_pending_done', {
    expired,
    candidateCount: candidateIds.length,
  });

  if (expired < candidateIds.length) {
    logWorkerVerbose('expire_pending_partial', {
      candidateCount: candidateIds.length,
      expired,
    });
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

  const claimedItems = Array.isArray(data) ? data : [];
  logWorkerVerbose('claim_batch_done', {
    claimed: claimedItems.length,
    claims: claimedItems.map((item) => ({
      tripId: item?.trip_id || null,
      attemptNo: Number(item?.attempt_no || 0) || null,
    })),
  });

  return claimedItems;
}

async function chooseDriverForClaim(
  trip,
  {
    attemptNo = 1,
    claimAttemptNo = null,
    queueAgeMs = null,
    allowedRadiiKm = null,
    excludedDriverIds = null,
  } = {}
) {
  const { pickupLat, pickupLng } = resolveDispatchPickupCoords(trip);
  const normalizedAttemptNo = Math.max(1, Math.round(Number(attemptNo) || 1));
  const normalizedClaimAttemptNo = Number.isFinite(Number(claimAttemptNo))
    ? Math.max(1, Math.round(Number(claimAttemptNo)))
    : normalizedAttemptNo;
  const queueAgeSeconds = Number.isFinite(Number(queueAgeMs))
    ? Number((Number(queueAgeMs) / 1000).toFixed(1))
    : null;
  const allowedRadii = Array.isArray(allowedRadiiKm) && allowedRadiiKm.length > 0
    ? allowedRadiiKm
    : getAllowedRadiiKm(normalizedAttemptNo);

  if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) {
    logWorker('driver_select_missing_coords', {
      tripId: trip?.id || null,
      attemptNo: normalizedAttemptNo,
      claimAttemptNo: normalizedClaimAttemptNo,
      queueAgeSeconds,
      destinationLat: trip?.destination_lat ?? null,
      destinationLng: trip?.destination_lng ?? null,
    });
    return null;
  }

  const passengerPhone = normalizePhone(trip.passenger_phone || '');
  const excludedDriverIdList = Array.isArray(excludedDriverIds)
    ? excludedDriverIds
    : getActiveDispatchExcludedDriverIds(trip?.wa_context);
  const excludedDriverIdsSet = new Set(excludedDriverIdList);

  const { data: driversRaw, error } = await getSupabaseAdmin()
    .from('drivers')
    .select('id, full_name, phone, push_token, current_lat, current_lng, is_available, pending_commission, last_commission_payment_at')
    .eq('is_available', true);

  if (error) throw error;

  // Excluir conductores con comisiones impagas por más de 3 días
  const commissionCutoffMs = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const drivers = (driversRaw || []).filter((d) => {
    const pending = Number(d.pending_commission || 0);
    if (pending <= 0) return true; // sin deuda → ok
    const lastPayment = d.last_commission_payment_at ? new Date(d.last_commission_payment_at).getTime() : 0;
    return lastPayment >= commissionCutoffMs; // pagó dentro de los últimos 3 días → ok
  });

  const suspendedCount = (driversRaw || []).length - drivers.length;
  if (suspendedCount > 0) {
    logWorker('drivers_suspended_by_commission', {
      tripId: trip?.id || null,
      suspendedCount,
      totalAvailable: (driversRaw || []).length,
    });
  }

  const withCoords = drivers.filter(
    (driver) => Number.isFinite(Number(driver.current_lat)) && Number.isFinite(Number(driver.current_lng))
  );

  const withoutSamePhone = passengerPhone
    ? withCoords.filter((driver) => normalizePhone(driver.phone || '') !== passengerPhone)
    : withCoords;

  const withoutExcluded = withoutSamePhone.filter((driver) => !excludedDriverIdsSet.has(driver.id));
  const excludedFilteredCount = Math.max(0, withoutSamePhone.length - withoutExcluded.length);
  if (excludedFilteredCount > 0) {
    logWorkerVerbose('driver_excluded_filtered', {
      tripId: trip?.id || null,
      filtered: excludedFilteredCount,
      excludedDriverIds: [...excludedDriverIdsSet],
    });
  }

  const samePhoneFilteredCount = Math.max(0, withCoords.length - withoutSamePhone.length);
  if (samePhoneFilteredCount > 0) {
    logWorker('driver_same_phone_filtered', {
      tripId: trip?.id || null,
      passengerPhone: maskPhone(passengerPhone),
      filtered: samePhoneFilteredCount,
    });
  }

  const candidatePoolIds = withoutSamePhone.map((driver) => driver.id).filter(Boolean);
  let busyDriverIds = new Set();
  if (candidatePoolIds.length > 0) {
    const { data: activeTrips, error: activeTripsError } = await getSupabaseAdmin()
      .from('trips')
      .select('driver_id, status')
      .in('driver_id', candidatePoolIds)
      .in('status', DRIVER_BUSY_TRIP_STATUSES);

    if (activeTripsError) throw activeTripsError;
    busyDriverIds = new Set((activeTrips || []).map((item) => item.driver_id).filter(Boolean));

    const { data: fleetRows, error: fleetRowsError } = await getSupabaseAdmin()
      .from('drivers')
      .select('id, owner_id, is_assigned_driver');
    if (fleetRowsError) throw fleetRowsError;
    busyDriverIds = expandBusyDriverIdsToFleet(fleetRows || [], busyDriverIds);
  }

  if (!withoutExcluded.length) {
    const expansionHint = buildRadiusExpansionHint({
      pickupLat,
      pickupLng,
      allowedRadii,
      drivers: withoutSamePhone,
      excludedDriverIds: excludedDriverIdsSet,
      busyDriverIds,
    });
    if (expansionHint) {
      logWorker('driver_select_ring_exhausted_expand', {
        tripId: trip?.id || null,
        attemptNo: normalizedAttemptNo,
        excludedFiltered: excludedFilteredCount,
        maxAllowedRadius: expansionHint.maxAllowedRadius,
        nearestBeyondKm: Number(expansionHint.nearestBeyondKm.toFixed(3)),
      });
      return expansionHint;
    }

    logWorker('driver_select_no_candidate', {
      tripId: trip?.id || null,
      attemptNo: normalizedAttemptNo,
      claimAttemptNo: normalizedClaimAttemptNo,
      queueAgeSeconds,
      availableDrivers: (drivers || []).length,
      withCoords: withCoords.length,
      samePhoneFiltered: samePhoneFilteredCount,
      excludedFiltered: excludedFilteredCount,
      busyFiltered: [...withoutSamePhone].filter((driver) => busyDriverIds.has(driver.id)).length,
      allowedRadiiKm: allowedRadii,
    });
    return null;
  }

  const driverIds = withoutExcluded.map((driver) => driver.id).filter(Boolean);
  if (!driverIds.length) return null;
  const candidateDrivers = withoutExcluded.filter((driver) => !busyDriverIds.has(driver.id));
  const busyFilteredCount = Math.max(0, withoutExcluded.length - candidateDrivers.length);
  if (!candidateDrivers.length) {
    logWorker('driver_select_no_candidate', {
      tripId: trip?.id || null,
      attemptNo: normalizedAttemptNo,
      claimAttemptNo: normalizedClaimAttemptNo,
      queueAgeSeconds,
      availableDrivers: (drivers || []).length,
      withCoords: withCoords.length,
      samePhoneFiltered: samePhoneFilteredCount,
      excludedFiltered: excludedFilteredCount,
      busyFiltered: busyFilteredCount,
      allowedRadiiKm: allowedRadii,
    });
    return null;
  }

  const reachableDrivers = candidateDrivers.filter((driver) => hasDriverNotificationChannel(driver));
  const noChannelFilteredCount = Math.max(0, candidateDrivers.length - reachableDrivers.length);
  logWorkerVerbose('driver_select_pool', {
    tripId: trip?.id || null,
    attemptNo: normalizedAttemptNo,
    claimAttemptNo: normalizedClaimAttemptNo,
    queueAgeSeconds,
    availableDrivers: (drivers || []).length,
    withCoords: withCoords.length,
    samePhoneFiltered: samePhoneFilteredCount,
    busyFiltered: busyFilteredCount,
    noChannelFiltered: noChannelFilteredCount,
    reachable: reachableDrivers.length,
    allowedRadiiKm: allowedRadii,
  });

  if (!reachableDrivers.length) {
    logWorker('driver_select_no_reachable_channel', {
      tripId: trip?.id || null,
      attemptNo: normalizedAttemptNo,
      claimAttemptNo: normalizedClaimAttemptNo,
      queueAgeSeconds,
      candidates: candidateDrivers.length,
      noChannelFiltered: noChannelFilteredCount,
      allowedRadiiKm: allowedRadii,
    });
    return null;
  }

  const scored = reachableDrivers
    .map((driver) => {
      const distanceKm = haversineKm(
        Number(driver.current_lat),
        Number(driver.current_lng),
        pickupLat,
        pickupLng
      );
      const pushPenaltyKm = isLikelyFcmToken(driver.push_token) ? 0 : NO_PUSH_TOKEN_SCORE_PENALTY_KM;
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

  const ringDistribution = allowedRadii.map((radiusKm) => ({
    radiusKm,
    candidates: scored.filter((item) => item.distanceKm <= radiusKm).length,
  }));
  logWorkerVerbose('driver_ring_scan', {
    tripId: trip?.id || null,
    attemptNo: normalizedAttemptNo,
    claimAttemptNo: normalizedClaimAttemptNo,
    queueAgeSeconds,
    allowedRadiiKm: allowedRadii,
    nearestDistanceKm: scored[0] ? Number(scored[0].distanceKm.toFixed(3)) : null,
    ringDistribution,
  });

  for (const radiusKm of allowedRadii) {
    const inRadius = scored.filter((item) => item.distanceKm <= radiusKm);
    if (inRadius.length > 0) {
      const selected = {
        ...inRadius[0],
        radiusKm,
        allowedRadiiKm: allowedRadii,
      };

      logWorker('driver_selected', {
        tripId: trip?.id || null,
        attemptNo: normalizedAttemptNo,
        claimAttemptNo: normalizedClaimAttemptNo,
        queueAgeSeconds,
        driverId: selected?.driver?.id || null,
        distanceKm: Number(selected.distanceKm.toFixed(3)),
        scoreKm: Number(selected.scoreKm.toFixed(3)),
        selectedRadiusKm: radiusKm,
        allowedRadiiKm: allowedRadii,
        hasPushToken: isLikelyFcmToken(selected?.driver?.push_token),
        hasWhatsApp: normalizePhone(selected?.driver?.phone || '').length >= 8,
      });

      return selected;
    }
  }

  const expansionHint = buildRadiusExpansionHint({
    pickupLat,
    pickupLng,
    allowedRadii,
    drivers: withoutExcluded,
    excludedDriverIds: excludedDriverIdsSet,
    busyDriverIds,
  });
  if (expansionHint) {
    logWorker('driver_select_ring_exhausted_expand', {
      tripId: trip?.id || null,
      attemptNo: normalizedAttemptNo,
      maxAllowedRadius: expansionHint.maxAllowedRadius,
      nearestBeyondKm: Number(expansionHint.nearestBeyondKm.toFixed(3)),
      nearestWithinAllowedKm: scored[0] ? Number(scored[0].distanceKm.toFixed(3)) : null,
    });
    return expansionHint;
  }

  logWorker('driver_select_no_match_in_allowed_rings', {
    tripId: trip?.id || null,
    attemptNo: normalizedAttemptNo,
    claimAttemptNo: normalizedClaimAttemptNo,
    queueAgeSeconds,
    allowedRadiiKm: allowedRadii,
    nearestDistanceKm: scored[0] ? Number(scored[0].distanceKm.toFixed(3)) : null,
  });

  return null;
}

async function sendPushNotification(pushToken, payload) {
  const token = String(pushToken || '').trim();
  if (!token) return { ok: false, reason: 'no_push_token' };

  if (!isLikelyFcmToken(token)) {
    if (isLegacyExpoPushToken(token)) {
      return { ok: false, reason: 'legacy_expo_token_format' };
    }
    return { ok: false, reason: 'invalid_push_token_format' };
  }

  try {
    const messageId = await getFirebaseMessagingClient().send({
      token,
      notification: {
        title: String(payload?.title || ''),
        body: String(payload?.body || ''),
      },
      data: normalizeFcmDataPayload(payload?.data || {}),
      android: {
        priority: 'high',
        notification: {
          channelId: 'trips',
          sound: 'default',
        },
      },
    });

    return { ok: true, ticketId: messageId || null };
  } catch (error) {
    const normalizedError = normalizeFirebaseSendError(error);
    return {
      ok: false,
      reason: normalizedError.reason,
      code: normalizedError.code || null,
    };
  }
}

async function sendWhatsAppText(phone, text) {
  const normalized = normalizePhone(phone);
  if (!normalized) return { ok: false, reason: 'invalid_driver_phone' };
  if (!WASENDER_API_KEY) return { ok: false, reason: 'missing_wasender_api_key' };

  const to = `${normalized}@s.whatsapp.net`;

  const response = await fetch(`${WASENDER_BASE_URL}/send-message`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${WASENDER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ to, text }),
  });

  const rawBody = await response.text().catch(() => '');
  let payload = null;
  try {
    payload = rawBody ? JSON.parse(rawBody) : null;
  } catch {
    payload = null;
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: `whatsapp_send_error:http_${response.status}:${rawBody.slice(0, 120) || 'no_body'}`,
    };
  }

  const apiError = payload?.error || payload?.errors || (payload?.success === false ? payload?.message : null);
  if (apiError) {
    return {
      ok: false,
      reason: `whatsapp_send_error:${String(apiError).slice(0, 120)}`,
    };
  }

  return {
    ok: true,
    to,
    msgId: payload?.data?.msgId ? String(payload.data.msgId) : null,
  };
}

async function notifyDriver(driver, trip) {
  const passengerPhone = normalizePhone(trip?.passenger_phone || '');
  const driverPhone = normalizePhone(driver?.phone || '');
  const driverAppDeepLink = buildDriverAppDeepLink(trip?.id);
  const nowMs = Date.now();
  const pushBackoffActive = pushProviderBackoffUntil > nowMs;
  const hasFcmPushToken = isLikelyFcmToken(driver?.push_token);

  logWorkerVerbose('notify_start', {
    tripId: trip?.id || null,
    driverId: driver?.id || null,
    passengerPhone: maskPhone(passengerPhone),
    driverPhone: maskPhone(driverPhone),
    pushEnabled: PUSH_NOTIFICATIONS_ENABLED,
    hasPushToken: hasFcmPushToken,
    hasLegacyExpoPushToken: isLegacyExpoPushToken(driver?.push_token),
    pushBackoffActive,
    pushBackoffRetryAfterMs: pushBackoffActive ? Math.max(0, pushProviderBackoffUntil - nowMs) : 0,
    hasWhatsApp: driverPhone.length >= 8,
    hasDeepLink: Boolean(driverAppDeepLink),
  });

  if (passengerPhone && driverPhone && passengerPhone === driverPhone) {
    logWorker('notify_skipped_same_phone', {
      tripId: trip?.id || null,
      driverId: driver?.id || null,
      driverPhone: maskPhone(driverPhone),
    });
    return { ok: false, reason: 'driver_phone_matches_passenger' };
  }

  if (PUSH_NOTIFICATIONS_ENABLED && hasFcmPushToken && !pushBackoffActive) {
    const pushResult = await sendPushNotification(driver.push_token, {
      title: 'Nuevo viaje asignado',
      body: `${trip.passenger_name || 'Pasajero'} -> ${resolveDispatchPickupCoords(trip).pickupAddress || trip.destination_address || 'Retiro'}`,
      data: {
        type: 'new_trip',
        tripId: trip.id,
        passengerPhone,
        deepLink: driverAppDeepLink || undefined,
      },
    });

    if (pushResult.ok) {
      if (pushProviderBackoffUntil > 0) {
        pushProviderBackoffUntil = 0;
        logWorker('notify_push_recovered', {
          tripId: trip?.id || null,
          driverId: driver?.id || null,
        });
      }

      logWorker('notify_push_ok', {
        tripId: trip?.id || null,
        driverId: driver?.id || null,
      });
      return { ok: true, channel: 'push', reason: 'push_ok' };
    }

    logWorker('notify_push_failed', {
      tripId: trip?.id || null,
      driverId: driver?.id || null,
      reason: pushResult?.reason || 'unknown',
      code: pushResult?.code || null,
    });

    if (isPushCredentialsIssue(pushResult?.reason) || isPushCredentialsIssue(pushResult?.code)) {
      pushProviderBackoffUntil = Date.now() + PUSH_PROVIDER_BACKOFF_MS;
      logWorker('notify_push_credentials_invalid', {
        tripId: trip?.id || null,
        driverId: driver?.id || null,
        reason: pushResult?.reason || 'unknown',
        backoffMs: PUSH_PROVIDER_BACKOFF_MS,
      });
    }
  } else if (PUSH_NOTIFICATIONS_ENABLED && driver?.push_token && !hasFcmPushToken) {
    logWorkerVerbose('notify_push_skipped_invalid_token_format', {
      tripId: trip?.id || null,
      driverId: driver?.id || null,
      reason: isLegacyExpoPushToken(driver?.push_token)
        ? 'legacy_expo_token_format'
        : 'invalid_push_token_format',
    });
  } else if (PUSH_NOTIFICATIONS_ENABLED && driver?.push_token && pushBackoffActive) {
    logWorkerVerbose('notify_push_skipped_provider_backoff', {
      tripId: trip?.id || null,
      driverId: driver?.id || null,
      retryAfterMs: Math.max(0, pushProviderBackoffUntil - nowMs),
    });
  }

  if (!driverPhone) {
    logWorker('notify_no_channel', {
      tripId: trip?.id || null,
      driverId: driver?.id || null,
      reason: 'no_driver_channel',
    });
    return { ok: false, reason: 'no_driver_channel' };
  }

  const { pickupAddress } = resolveDispatchPickupCoords(trip);
  const whatsappResult = await sendWhatsAppText(
    driverPhone,
    [
      '🚖 *Nuevo viaje asignado*',
      trip.passenger_name ? `Pasajero: *${trip.passenger_name}*` : null,
      pickupAddress ? `Retiro: *${pickupAddress}*` : null,
      '',
      driverAppDeepLink ? `Abrí directo la app: ${driverAppDeepLink}` : 'Abrí la app para verlo.',
    ]
      .filter(Boolean)
      .join('\n')
  );

  if (!whatsappResult.ok) {
    logWorker('notify_whatsapp_failed', {
      tripId: trip?.id || null,
      driverId: driver?.id || null,
      reason: whatsappResult.reason || 'whatsapp_send_error',
    });
    return { ok: false, reason: whatsappResult.reason || 'whatsapp_send_error' };
  }

  logWorker('notify_whatsapp_ok', {
    tripId: trip?.id || null,
    driverId: driver?.id || null,
    to: whatsappResult.to || null,
    msgId: whatsappResult.msgId || null,
  });

  return { ok: true, channel: 'whatsapp', reason: 'push_failed_whatsapp_ok' };
}

async function selectDriverForClaimAttempt(
  trip,
  {
    attemptNo,
    claimAttemptNo,
    queueAgeMs,
    excludedDriverIds,
    effectiveAttemptNoRef,
  } = {}
) {
  let driverSelection = null;

  for (let expansionGuard = 0; expansionGuard < SEARCH_RADII_KM.length; expansionGuard += 1) {
    const allowedRadiiKm = getAllowedRadiiKm(effectiveAttemptNoRef.value);
    driverSelection = await chooseDriverForClaim(trip, {
      attemptNo: effectiveAttemptNoRef.value,
      claimAttemptNo,
      queueAgeMs,
      allowedRadiiKm,
      excludedDriverIds,
    });

    if (driverSelection?.driver) break;

    if (!driverSelection?.expandRadius) {
      driverSelection = null;
      break;
    }

    const previousMaxRadius = driverSelection.maxAllowedRadius;
    effectiveAttemptNoRef.value += 1;
    logWorker('claim_radius_expanded_after_ring_exhaustion', {
      tripId: trip?.id || null,
      attemptNo,
      newEffectiveAttemptNo: effectiveAttemptNoRef.value,
      previousMaxRadiusKm: previousMaxRadius,
      nearestBeyondKm: Number(driverSelection.nearestBeyondKm.toFixed(3)),
      newAllowedRadiiKm: getAllowedRadiiKm(effectiveAttemptNoRef.value),
    });
  }

  return driverSelection;
}

async function requeuePendingTripAfterNotifyFailure(tripId, notifyReason = 'notify_failed') {
  const { data: tripRow } = await getSupabaseAdmin()
    .from('trips')
    .select('status, cancel_reason, wa_context, driver_id, notes, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng')
    .eq('id', tripId)
    .maybeSingle();

  if (!canRequeuePendingTrip(tripRow)) {
    logWorkerVerbose('requeue_notify_fail_skipped', {
      tripId,
      notifyReason,
      status: tripRow?.status || null,
      cancelReason: tripRow?.cancel_reason || null,
    });
    return false;
  }

  const updatedWaContext = buildWaContextAfterNotifyFailure(tripRow?.wa_context, notifyReason);
  const nextDispatchAt = new Date(
    Date.now() + Math.max(1, DISPATCH_NOTIFY_FAIL_RETRY_SECONDS) * 1000
  ).toISOString();

  const { data, error } = await getSupabaseAdmin()
    .from('trips')
    .update(buildPendingToQueuedUpdate(tripRow || {}, {
      cancel_reason: `[AUTO_REQUEUE] Falla de notificacion: ${String(notifyReason).slice(0, 140)}`,
      wa_context: updatedWaContext,
      next_dispatch_at: nextDispatchAt,
    }))
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

  if (data?.id) {
    await restoreDispatchBackoffAfterRequeue(tripId, nextDispatchAt, notifyReason);
  }

  return Boolean(data?.id);
}

async function processDispatchClaim(claim) {
  const tripId = claim?.trip_id;
  const lockToken = claim?.lock_token;
  const attemptNo = Math.max(1, Math.round(Number(claim?.attempt_no) || 1));
  const queueAgeMs = computeQueueAgeMs(claim?.enqueued_at);
  const queueAgeSeconds = Number.isFinite(Number(queueAgeMs))
    ? Number((Number(queueAgeMs) / 1000).toFixed(1))
    : null;

  if (!tripId || !lockToken) {
    logWorker('claim_process_invalid', {
      tripId: tripId || null,
      hasLockToken: Boolean(lockToken),
    });
    return { status: 'invalid_claim' };
  }

  const supabase = getSupabaseAdmin();

  try {
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('id, status, passenger_name, passenger_phone, notes, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng, dispatch_attempts, wa_context')
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

    if (isPassengerInitiatedCancellation(trip)) {
      await releaseDispatchClaim({
        tripId,
        lockToken,
        result: 'done',
        errorCode: 'passenger_cancelled',
      });
      logWorkerVerbose('claim_skip_passenger_cancelled', { tripId });
      return { status: 'passenger_cancelled' };
    }

    if (String(trip.status || '').toLowerCase() !== 'queued') {
      await releaseDispatchClaim({
        tripId,
        lockToken,
        result: 'done',
        errorCode: `trip_status_${trip.status || 'unknown'}`,
      });
      logWorkerVerbose('claim_trip_not_queued', {
        tripId,
        status: trip.status || null,
      });
      return { status: 'trip_not_queued' };
    }

    const excludedDriverCount = getActiveDispatchExcludedDriverIds(trip.wa_context).length;
    let effectiveAttemptNo = getEffectiveAttemptNo(attemptNo, queueAgeMs, excludedDriverCount);

    logWorker('claim_process_start', {
      tripId: tripId || null,
      attemptNo,
      effectiveAttemptNo,
      excludedDriverCount,
      queueAgeSeconds,
      allowedRadiiKm: getAllowedRadiiKm(effectiveAttemptNo),
    });

    // Límite por intentos reales de dispatch (claim), NO por tiempo en cola.
    // Un viaje en hold (esperando precio/dirección) puede tener queueAge alto sin haber
    // intentado buscar chofer; effectiveAttemptNo infla por edad de cola y cancelaba al pasar.
    const dispatchAttempts = Number(trip.dispatch_attempts || 0);
    const exceededMaxAttempts =
      attemptNo > MAX_DISPATCH_ATTEMPTS || dispatchAttempts > MAX_DISPATCH_ATTEMPTS;

    if (exceededMaxAttempts) {
      // Guardar solo si el viaje aún está en estado 'queued'; si el conductor ya lo aceptó
      // entre la lectura y este punto (.eq status check), no cancelar ni notificar al pasajero.
      const { data: cancelledTrip, error: cancelErr } = await supabase
        .from('trips')
        .update({
          status: 'cancelled',
          cancel_reason: `Sin chofer disponible tras ${Math.max(attemptNo, dispatchAttempts)} intentos`,
          dispatch_status: 'dead_letter',
          status_updated_at: new Date().toISOString(),
        })
        .eq('id', tripId)
        .eq('status', 'queued')
        .select('id')
        .maybeSingle();
      if (cancelErr) {
        logWorker('claim_max_attempts_cancel_error', { tripId, error: summarizeDbError(cancelErr) });
      }
      await releaseDispatchClaim({
        tripId,
        lockToken,
        result: 'done',
        errorCode: 'max_attempts_exhausted',
      });
      logWorker('claim_max_attempts_exhausted', {
        tripId,
        attemptNo,
        dispatchAttempts,
        effectiveAttemptNo,
        queueAgeSeconds,
        maxAttempts: MAX_DISPATCH_ATTEMPTS,
        cancelled: Boolean(cancelledTrip?.id),
      });
      // Solo notificar al pasajero si el cancel fue efectivo (el viaje aún estaba en queued)
      if (!cancelErr && cancelledTrip?.id && trip.passenger_phone) {
        await sendWhatsAppText(
          trip.passenger_phone,
          '😔 Lamentablemente no encontramos un chofer disponible para tu viaje en este momento. Podés intentarlo de nuevo en unos minutos.'
        ).catch(() => {});
      }
      return { status: 'max_attempts_exhausted' };
    }

    const { pickupLat, pickupLng } = resolveDispatchPickupCoords(trip);
    if (!Number.isFinite(pickupLat) || !Number.isFinite(pickupLng)) {
      await releaseDispatchClaim({
        tripId,
        lockToken,
        result: 'retry',
        retrySeconds: 90,
        errorCode: 'missing_pickup_coordinates',
      });
      logWorker('claim_missing_pickup_coordinates', {
        tripId,
        attemptNo,
        originLat: trip.origin_lat ?? null,
        originLng: trip.origin_lng ?? null,
        destinationLat: trip.destination_lat ?? null,
        destinationLng: trip.destination_lng ?? null,
      });
      return { status: 'missing_pickup_coordinates' };
    }

    const pickupDistanceFromCenterKm = getPickupDistanceFromOperationCenterKm(pickupLat, pickupLng);
    if (
      Number.isFinite(Number(pickupDistanceFromCenterKm))
      && pickupDistanceFromCenterKm > DISPATCH_MAX_PICKUP_DISTANCE_FROM_CENTER_KM
    ) {
      const retrySeconds = Math.max(180, DISPATCH_NOTIFY_FAIL_RETRY_SECONDS);
      const distanceText = Number(pickupDistanceFromCenterKm).toFixed(3);

      await setDispatchQueueRetry(
        tripId,
        retrySeconds,
        `pickup_out_of_operational_area:${distanceText}km_from_center`
      );
      await releaseDispatchClaim({
        tripId,
        lockToken,
        result: 'retry',
        retrySeconds,
        errorCode: 'pickup_out_of_operational_area',
        errorText: `pickup_distance_from_center_km=${distanceText};max_allowed_km=${DISPATCH_MAX_PICKUP_DISTANCE_FROM_CENTER_KM}`,
      });

      logWorker('claim_pickup_out_of_operational_area', {
        tripId,
        attemptNo,
        pickupLat,
        pickupLng,
        pickupDistanceFromCenterKm: Number(distanceText),
        maxAllowedKm: DISPATCH_MAX_PICKUP_DISTANCE_FROM_CENTER_KM,
      });

      return {
        status: 'pickup_out_of_operational_area',
        pickupDistanceFromCenterKm: Number(distanceText),
        maxAllowedKm: DISPATCH_MAX_PICKUP_DISTANCE_FROM_CENTER_KM,
      };
    }

    const effectiveAttemptNoRef = { value: effectiveAttemptNo };
    let activeExcludedDriverIds = getActiveDispatchExcludedDriverIds(trip.wa_context);
    let driverSelection = await selectDriverForClaimAttempt(trip, {
      attemptNo,
      claimAttemptNo: attemptNo,
      queueAgeMs,
      excludedDriverIds: activeExcludedDriverIds,
      effectiveAttemptNoRef,
    });
    effectiveAttemptNo = effectiveAttemptNoRef.value;

    if (!driverSelection?.driver && canResetTimeoutRoundExclusions(trip.wa_context)) {
      const roundState = normalizeDispatchExclusionState(trip.wa_context);
      const resetContext = clearTimeoutRoundExclusions(trip.wa_context);
      const { error: resetError } = await supabase
        .from('trips')
        .update({ wa_context: resetContext })
        .eq('id', tripId)
        .eq('status', 'queued');

      if (!resetError) {
        trip.wa_context = resetContext;
        activeExcludedDriverIds = getActiveDispatchExcludedDriverIds(resetContext);
        logWorker('claim_timeout_round_reset', {
          tripId,
          resetDriverIds: roundState.roundExcluded,
          permanentExcludedDriverIds: roundState.permanentExcluded,
          driverOfferCounts: roundState.offerCounts,
          maxDriverOfferAttempts: MAX_DRIVER_OFFER_ATTEMPTS,
        });

        driverSelection = await selectDriverForClaimAttempt(trip, {
          attemptNo,
          claimAttemptNo: attemptNo,
          queueAgeMs,
          excludedDriverIds: activeExcludedDriverIds,
          effectiveAttemptNoRef,
        });
        effectiveAttemptNo = effectiveAttemptNoRef.value;
      } else {
        logWorker('claim_timeout_round_reset_error', {
          tripId,
          error: summarizeDbError(resetError),
        });
      }
    }

    if (!driverSelection?.driver) {
      await releaseDispatchClaim({
        tripId,
        lockToken,
        result: 'retry',
        retrySeconds: DISPATCH_RETRY_SECONDS,
        errorCode: 'no_driver_available',
      });
      logWorker('claim_no_driver_available', {
        tripId,
        attemptNo,
        effectiveAttemptNo,
        excludedDriverCount,
        queueAgeSeconds,
        allowedRadiiKm: getAllowedRadiiKm(effectiveAttemptNo),
      });
      return { status: 'no_driver_available' };
    }

    const selectedDriver = driverSelection.driver;

    // Re-verificación justo antes de asignar: dos instancias Vercel pueden seleccionar el
    // mismo conductor para viajes distintos si ambas leen "is_available=true" antes de que
    // cualquiera haga commit. Este check reduce drásticamente esa ventana de race condition.
    {
      const { data: driverBusy, error: driverBusyErr } = await supabase
        .from('trips')
        .select('id')
        .eq('driver_id', selectedDriver.id)
        .in('status', DRIVER_BUSY_TRIP_STATUSES)
        .limit(1)
        .maybeSingle();

      if (driverBusyErr) throw driverBusyErr;

      if (driverBusy) {
        await releaseDispatchClaim({
          tripId,
          lockToken,
          result: 'retry',
          retrySeconds: DISPATCH_RETRY_SECONDS,
          errorCode: 'driver_became_busy',
        });
        logWorkerVerbose('claim_driver_became_busy_retry', {
          tripId,
          attemptNo,
          driverId: selectedDriver.id,
        });
        return { status: 'no_driver_available' };
      }
    }

    const assignedAt = new Date().toISOString();

    const tripIsPassengerApp = isPassengerAppTrip(trip);
    const assignUpdate = {
      driver_id: selectedDriver.id,
      status: 'pending',
      assigned_at: assignedAt,
      dispatch_status: 'waiting_acceptance',
    };
    // Legacy WhatsApp: origin_* = GPS del chofer al asignar.
    // Nuevo esquema / passenger-app: origin_* = recogida del pasajero (no pisar).
    if (!shouldPreservePickupOriginOnAssign(trip)) {
      assignUpdate.origin_address = `${Number(selectedDriver.current_lat).toFixed(5)}, ${Number(selectedDriver.current_lng).toFixed(5)}`;
      assignUpdate.origin_lat = Number(selectedDriver.current_lat);
      assignUpdate.origin_lng = Number(selectedDriver.current_lng);
    }

    const { data: assignedTrip, error: assignError } = await supabase
      .from('trips')
      .update(assignUpdate)
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
      logWorkerVerbose('claim_trip_claim_lost', {
        tripId,
        attemptNo,
        driverId: selectedDriver.id,
      });
      return { status: 'trip_claim_lost' };
    }

    logWorker('claim_trip_assigned_pending', {
      tripId,
      attemptNo,
      effectiveAttemptNo,
      queueAgeSeconds,
      driverId: selectedDriver.id,
      distanceKm: Number(driverSelection.distanceKm.toFixed(3)),
      scoreKm: Number(driverSelection.scoreKm.toFixed(3)),
      searchRadiusKm: driverSelection.radiusKm,
    });

    const notifyResult = await notifyDriver(
      selectedDriver,
      {
        ...trip,
        ...assignedTrip,
      }
    );

    if (tripIsPassengerApp) {
      try {
        const pushResult = await trySendPassengerAppTripPush(
          supabase,
          {
            ...trip,
            ...assignedTrip,
            status: 'pending',
          },
          selectedDriver
        );
        logWorker('passenger_app_push_pending', {
          tripId,
          ok: Boolean(pushResult?.ok),
          reason: pushResult?.reason || null,
          status: pushResult?.status || 'pending',
        });
      } catch (pushError) {
        logWorker('passenger_app_push_pending_error', {
          tripId,
          error: pushError?.message || 'unknown',
        });
      }
    }

    if (!notifyResult?.ok) {
      await requeuePendingTripAfterNotifyFailure(
        tripId,
        notifyResult?.reason || 'notify_failed'
      );
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

      logWorker('claim_notify_failed', {
        tripId,
        attemptNo,
        driverId: selectedDriver.id,
        reason: notifyResult?.reason || 'unknown',
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

    logWorker('claim_assigned_done', {
      tripId,
      attemptNo,
      effectiveAttemptNo,
      queueAgeSeconds,
      driverId: selectedDriver.id,
      channel: notifyResult.channel || null,
      distanceKm: Number(driverSelection.distanceKm.toFixed(3)),
      scoreKm: Number(driverSelection.scoreKm.toFixed(3)),
      searchRadiusKm: driverSelection.radiusKm,
    });

    return {
      status: 'assigned',
      driverId: selectedDriver.id,
      channel: notifyResult.channel || null,
      distanceKm: Number(driverSelection.distanceKm.toFixed(3)),
      scoreKm: Number(driverSelection.scoreKm.toFixed(3)),
      searchRadiusKm: driverSelection.radiusKm,
      attemptNo,
      effectiveAttemptNo,
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

async function promoteScheduledTripsBeforeDispatch() {
  return promoteDueScheduledTrips({
    supabase: getSupabaseAdmin(),
    log: logWorker,
    dispatchAheadMs: SCHEDULED_DISPATCH_AHEAD_MS,
    sendPassengerWhatsApp: async (phone, text) => sendWhatsAppText(phone, text),
  });
}

async function runDispatchWorkerCycle() {
  const nowMs = Date.now();
  const pushBackoffActive = pushProviderBackoffUntil > nowMs;

  logWorker('cycle_start', {
    workerId: WORKER_ID,
    batchSize: DISPATCH_BATCH_SIZE,
    lockSeconds: DISPATCH_LOCK_SECONDS,
    retrySeconds: DISPATCH_RETRY_SECONDS,
    notifyFailRetrySeconds: DISPATCH_NOTIFY_FAIL_RETRY_SECONDS,
    scheduledDispatchAheadMs: SCHEDULED_DISPATCH_AHEAD_MS,
    pushProviderBackoffMs: PUSH_PROVIDER_BACKOFF_MS,
    pushProviderBackoffActive: pushBackoffActive,
    pushProviderBackoffRetryAfterMs: pushBackoffActive ? Math.max(0, pushProviderBackoffUntil - nowMs) : 0,
    searchExpansionIntervalMs: SEARCH_EXPANSION_INTERVAL_MS,
    pendingAcceptTimeoutMs: PENDING_ACCEPT_TIMEOUT_MS,
    searchRadiiKm: SEARCH_RADII_KM,
    verboseLogs: DISPATCH_VERBOSE_LOGS,
  });

  const scheduledResult = await promoteScheduledTripsBeforeDispatch();
  const expireResult = await expireTimedOutPendingTrips();
  const claimedItems = await claimDispatchBatch();

  const summary = {
    workerId: WORKER_ID,
    scheduledPromoted: scheduledResult.promoted || 0,
    scheduledScanned: scheduledResult.scanned || 0,
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
    logWorkerVerbose('claim_result', {
      tripId: claim?.trip_id || null,
      ...result,
    });

    if (result.status === 'assigned') summary.assigned += 1;
    else if (result.status === 'no_driver_available') summary.noDriver += 1;
    else if (result.status === 'notify_failed') summary.notifyFailed += 1;
    else if (result.status === 'error') summary.errors += 1;
    else summary.skipped += 1;
  }

  logWorker('cycle_done', {
    scheduledPromoted: summary.scheduledPromoted,
    scheduledScanned: summary.scheduledScanned,
    claimed: summary.claimed,
    assigned: summary.assigned,
    noDriver: summary.noDriver,
    notifyFailed: summary.notifyFailed,
    skipped: summary.skipped,
    errors: summary.errors,
    expiredPending: summary.expiredPending,
    results: DISPATCH_VERBOSE_LOGS ? summary.results : undefined,
  });

  return summary;
}

export async function GET(req) {
  try {
    const auth = isAuthorizedRequest(req);
    logWorker('http_get_start', {
      viaVercelCron: auth.viaVercelCron,
      hasCronSecret: Boolean(CRON_SECRET),
      hasAuthHeader: Boolean(req.headers.get('authorization')),
      hasXCronSecret: Boolean(req.headers.get('x-cron-secret')),
    });

    if (!auth.ok) {
      logWorker('http_get_unauthorized', {
        viaVercelCron: auth.viaVercelCron,
        hasAuthHeader: auth.hasAuthHeader,
        hasXCronSecret: auth.hasXCronSecret,
        hasQuerySecret: auth.hasQuerySecret,
      });
      return NextResponse.json(
        { ok: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const summary = await runDispatchWorkerCycle();
    logWorker('http_get_result', {
      viaVercelCron: auth.viaVercelCron,
      scheduledPromoted: summary.scheduledPromoted,
      claimed: summary.claimed,
      assigned: summary.assigned,
      noDriver: summary.noDriver,
      notifyFailed: summary.notifyFailed,
      errors: summary.errors,
    });

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
