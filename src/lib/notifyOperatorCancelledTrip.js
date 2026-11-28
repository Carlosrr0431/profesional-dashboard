import { isPassengerAppTrip } from '../../shared/trip-contract.js';
import {
  getFirebaseMessagingClient,
  isLegacyExpoPushToken,
  isLikelyFcmToken,
  buildAndroidNotificationTag,
  normalizeFcmDataPayload,
  normalizeFirebaseSendError,
} from './firebaseAdmin';
import { trySendPassengerAppTripPush } from './passengerPushNotifications';

async function notifyDriverOfOperatorCancel(supabase, trip) {
  const driverId = String(trip?.driver_id || '').trim();
  if (!driverId) return { ok: false, reason: 'no_driver' };

  const { data: driver, error } = await supabase
    .from('drivers')
    .select('id, push_token')
    .eq('id', driverId)
    .maybeSingle();

  if (error) throw error;
  const token = String(driver?.push_token || '').trim();
  if (!token) return { ok: false, reason: 'no_push_token' };
  if (!isLikelyFcmToken(token)) {
    return {
      ok: false,
      reason: isLegacyExpoPushToken(token)
        ? 'legacy_expo_token_format'
        : 'invalid_push_token_format',
    };
  }

  const data = {
    type: 'trip_cancelled',
    tripId: trip.id,
  };
  const collapseTag = buildAndroidNotificationTag(data);
  // Si era el siguiente viaje, el chofer sigue con uno en curso: que no crea que cancelaron ese.
  const wasNextTrip = Boolean(String(trip?.next_after_trip_id || '').trim());
  try {
    await getFirebaseMessagingClient().send({
      token,
      notification: {
        title: wasNextTrip ? 'Siguiente viaje cancelado' : 'Viaje cancelado',
        body: wasNextTrip
          ? 'La central canceló tu siguiente viaje. Seguí con el viaje actual.'
          : 'La central canceló el viaje.',
      },
      data: normalizeFcmDataPayload(data),
      android: {
        priority: 'high',
        notification: {
          channelId: 'trips',
          sound: 'default',
          ...(collapseTag ? { tag: collapseTag } : {}),
        },
      },
    });
    return { ok: true };
  } catch (error) {
    const normalized = normalizeFirebaseSendError(error);
    return { ok: false, reason: normalized.reason || 'push_error' };
  }
}

export async function notifyOperatorCancelledTrip(supabase, trip, { skipPassenger = false } = {}) {
  if (!trip?.id) return { driver: null, passenger: null };

  let driver = null;
  let passenger = null;

  try {
    driver = await notifyDriverOfOperatorCancel(supabase, trip);
  } catch (err) {
    console.error('[cancelTripAsOperator] driver notify', err);
    driver = { ok: false, reason: 'driver_notify_error' };
  }

  try {
    if (skipPassenger) {
      passenger = { ok: true, reason: 'requeued' };
    } else if (isPassengerAppTrip(trip)) {
      passenger = await trySendPassengerAppTripPush(supabase, trip);
    } else {
      passenger = { ok: true, reason: 'whatsapp_disabled' };
    }
  } catch (err) {
    console.error('[cancelTripAsOperator] passenger notify', err);
    passenger = { ok: false, reason: 'passenger_notify_error' };
  }

  return { driver, passenger };
}
