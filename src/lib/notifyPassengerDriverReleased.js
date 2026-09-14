import { isPassengerAppTrip } from '../../shared/trip-contract.js';
import { trySendPassengerAppTripPush } from './passengerPushNotifications';
import {
  getWhatsmeowApiKey,
  normalizeWhatsmeowPhone,
  sendWhatsmeowText,
} from './whatsmeowClient';
import {
  getDefaultWhatsmeowLine,
  resolveWhatsmeowLineForPassenger,
} from './whatsmeowLines';

export const DRIVER_RELEASE_WHATSAPP_TEXT =
  'El chofer no pudo continuar. Seguimos buscando otro móvil para tu mismo viaje y te avisamos apenas se confirme.';

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

    const phone = normalizeWhatsmeowPhone(trip.passenger_phone);
    if (!phone) {
      return { ok: false, reason: 'no_phone' };
    }

    const apiKey = getWhatsmeowApiKey();
    const line = await resolveWhatsmeowLineForPassenger(supabase, {
      passengerPhone: phone,
      tripWaContext: trip.wa_context,
    }) || getDefaultWhatsmeowLine();

    if (!apiKey || !line?.agentCode) {
      return { ok: false, reason: 'missing_whatsmeow' };
    }

    const result = await sendWhatsmeowText(
      line.agentCode,
      phone,
      DRIVER_RELEASE_WHATSAPP_TEXT,
      { apiKey },
    );

    return {
      ok: Boolean(result?.success),
      reason: result?.success ? null : (result?.error || 'whatsapp_send_error'),
    };
  } catch (error) {
    return { ok: false, reason: error?.message || 'notify_error' };
  }
}
