import { isPassengerAppTrip } from '../../shared/trip-contract.js';
import { trySendPassengerAppTripPush } from './passengerPushNotifications';

export async function notifyPassengerDriverReleased(supabase, trip) {
  if (!trip?.id) {
    return { ok: false, reason: 'missing_trip' };
  }

  try {
    if (isPassengerAppTrip(trip)) {
      return trySendPassengerAppTripPush(supabase, {
        ...trip,
        status: 'queued',
        driver_id: null,
      }, null);
    }

    return { ok: true, reason: 'whatsapp_disabled' };
  } catch (error) {
    return { ok: false, reason: error?.message || 'notify_error' };
  }
}
