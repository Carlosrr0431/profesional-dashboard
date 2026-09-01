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
import { getWhatsmeowApiKey, sendWhatsmeowText } from './whatsmeowClient';
import {
  hasAnyWhatsmeowConfig,
  resolveWhatsmeowLineForPassenger,
} from './whatsmeowLines';

const WHATSAPP_OPERATOR_CANCEL_TEXT =
  'Tu viaje fue cancelado desde la central. Si necesitás un móvil, escribime 👍';

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
  try {
    await getFirebaseMessagingClient().send({
      token,
      notification: {
        title: 'Viaje cancelado',
        body: 'La central canceló el viaje.',
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

async function notifyWhatsAppPassengerOfOperatorCancel(supabase, trip) {
  const phone = String(trip?.passenger_phone || '').trim();
  if (!phone || !hasAnyWhatsmeowConfig()) {
    return { ok: false, reason: 'whatsapp_not_configured' };
  }

  const line = await resolveWhatsmeowLineForPassenger(supabase, {
    passengerPhone: phone,
    tripWaContext: trip?.wa_context,
  });
  const apiKey = getWhatsmeowApiKey();
  if (!apiKey || !line?.agentCode) {
    return { ok: false, reason: 'whatsapp_line_missing' };
  }

  const result = await sendWhatsmeowText(line.agentCode, phone, WHATSAPP_OPERATOR_CANCEL_TEXT, {
    apiKey,
    meta: { source: 'operator_cancel', tripId: trip.id },
  });
  return result?.success
    ? { ok: true }
    : { ok: false, reason: result?.error || 'whatsapp_send_failed' };
}

export async function notifyOperatorCancelledTrip(supabase, trip) {
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
    if (isPassengerAppTrip(trip)) {
      passenger = await trySendPassengerAppTripPush(supabase, trip);
    } else {
      passenger = await notifyWhatsAppPassengerOfOperatorCancel(supabase, trip);
    }
  } catch (err) {
    console.error('[cancelTripAsOperator] passenger notify', err);
    passenger = { ok: false, reason: 'passenger_notify_error' };
  }

  return { driver, passenger };
}
