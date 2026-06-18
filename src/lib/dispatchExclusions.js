export const MAX_DRIVER_OFFER_ATTEMPTS = 3;

function safeJsonParse(value, fallback = {}) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

function normalizeDriverIdList(values) {
  const normalized = [];
  for (const value of values || []) {
    const id = String(value || '').trim();
    if (!id || normalized.includes(id)) continue;
    normalized.push(id);
  }
  return normalized;
}

export function isTimeoutDispatchExclusionReason(reason) {
  const normalized = String(reason || '').toLowerCase();
  return normalized === 'pending_accept_timeout' || normalized === 'driver_timeout';
}

export function isNotifyFailDispatchExclusionReason(reason) {
  return String(reason || '').toLowerCase().startsWith('notify_fail');
}

export function getTripDispatchExcludedDriverIds(waContext) {
  const context = safeJsonParse(waContext, {});
  const excluded = Array.isArray(context?.dispatch_excluded_driver_ids)
    ? context.dispatch_excluded_driver_ids
    : [];
  return normalizeDriverIdList(excluded);
}

export function getDispatchDriverOfferCounts(waContext) {
  const context = safeJsonParse(waContext, {});
  const counts = context?.dispatch_driver_offer_counts;
  if (!counts || typeof counts !== 'object') return {};

  const normalized = {};
  for (const [key, value] of Object.entries(counts)) {
    const id = String(key || '').trim();
    const count = Math.round(Number(value));
    if (!id || !Number.isFinite(count) || count <= 0) continue;
    normalized[id] = count;
  }
  return normalized;
}

export function normalizeDispatchExclusionState(waContext) {
  const context = safeJsonParse(waContext, {});
  const offerCounts = getDispatchDriverOfferCounts(context);

  if (Array.isArray(context.dispatch_round_excluded_driver_ids)) {
    const permanentExcluded = normalizeDriverIdList(context.dispatch_permanent_excluded_driver_ids);
    const roundExcluded = normalizeDriverIdList(context.dispatch_round_excluded_driver_ids);
    const allExcluded = normalizeDriverIdList([
      ...permanentExcluded,
      ...roundExcluded,
    ]);

    return {
      context,
      allExcluded,
      permanentExcluded,
      roundExcluded,
      offerCounts,
      isLegacy: false,
    };
  }

  const legacyExcluded = getTripDispatchExcludedDriverIds(context);
  return {
    context,
    allExcluded: legacyExcluded,
    permanentExcluded: legacyExcluded,
    roundExcluded: [],
    offerCounts,
    isLegacy: true,
  };
}

export function getActiveDispatchExcludedDriverIds(waContext) {
  const state = normalizeDispatchExclusionState(waContext);
  if (state.isLegacy) return state.allExcluded;
  return normalizeDriverIdList([...state.permanentExcluded, ...state.roundExcluded]);
}

export function canResetTimeoutRoundExclusions(waContext) {
  const state = normalizeDispatchExclusionState(waContext);
  if (state.isLegacy) return false;
  return state.roundExcluded.length > 0;
}

export function clearTimeoutRoundExclusions(waContext) {
  const state = normalizeDispatchExclusionState(waContext);
  if (!canResetTimeoutRoundExclusions(waContext)) {
    return state.context;
  }

  return {
    ...state.context,
    dispatch_excluded_driver_ids: [...state.permanentExcluded],
    dispatch_permanent_excluded_driver_ids: [...state.permanentExcluded],
    dispatch_round_excluded_driver_ids: [],
    dispatch_last_round_reset_at: new Date().toISOString(),
  };
}

export function buildWaContextAfterNotifyFailure(waContext, notifyReason = 'unknown') {
  const context = safeJsonParse(waContext, {});
  const reasonStr = String(notifyReason || 'unknown').slice(0, 140);

  return {
    ...context,
    dispatch_last_notify_fail_reason: reasonStr,
    dispatch_last_notify_fail_at: new Date().toISOString(),
  };
}

export function buildWaContextWithExcludedDriver(waContext, driverId, reason = 'unknown') {
  const normalizedDriverId = String(driverId || '').trim();
  if (!normalizedDriverId) return safeJsonParse(waContext, {});

  if (isNotifyFailDispatchExclusionReason(reason)) {
    return buildWaContextAfterNotifyFailure(waContext, String(reason).replace(/^notify_fail:/i, ''));
  }

  const context = safeJsonParse(waContext, {});
  const state = normalizeDispatchExclusionState(context);
  const exclusionReasons = {
    ...(context.dispatch_exclusion_reasons && typeof context.dispatch_exclusion_reasons === 'object'
      ? context.dispatch_exclusion_reasons
      : {}),
  };

  if (state.permanentExcluded.includes(normalizedDriverId)) {
    return context;
  }

  let permanentExcluded = [...state.permanentExcluded];
  let roundExcluded = [...state.roundExcluded];
  const offerCounts = { ...state.offerCounts };
  const reasonStr = String(reason || 'unknown').slice(0, 140);
  exclusionReasons[normalizedDriverId] = reasonStr;

  if (isTimeoutDispatchExclusionReason(reason)) {
    const nextOfferCount = (offerCounts[normalizedDriverId] || 0) + 1;
    offerCounts[normalizedDriverId] = nextOfferCount;
    roundExcluded = roundExcluded.filter((id) => id !== normalizedDriverId);
    permanentExcluded = permanentExcluded.filter((id) => id !== normalizedDriverId);

    if (nextOfferCount >= MAX_DRIVER_OFFER_ATTEMPTS) {
      permanentExcluded.push(normalizedDriverId);
    } else {
      roundExcluded.push(normalizedDriverId);
    }
  } else {
    roundExcluded = roundExcluded.filter((id) => id !== normalizedDriverId);
    if (!permanentExcluded.includes(normalizedDriverId)) {
      permanentExcluded.push(normalizedDriverId);
    }
  }

  const allExcluded = normalizeDriverIdList([...permanentExcluded, ...roundExcluded]);

  return {
    ...context,
    dispatch_excluded_driver_ids: allExcluded,
    dispatch_permanent_excluded_driver_ids: permanentExcluded,
    dispatch_round_excluded_driver_ids: roundExcluded,
    dispatch_driver_offer_counts: offerCounts,
    dispatch_exclusion_reasons: exclusionReasons,
    dispatch_last_excluded_at: new Date().toISOString(),
    dispatch_last_excluded_reason: reasonStr,
  };
}
