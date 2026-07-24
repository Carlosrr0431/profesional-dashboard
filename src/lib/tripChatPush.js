/**
 * Push FCM al receptor de un mensaje del chat del viaje.
 */
import { sendDriverPushById } from './driverPushNotifications';
import { sendPassengerPushByPhone } from './passengerPushNotifications';

const PREVIEW_MAX = 80;

export function buildTripChatPushPreview({ messageType, body } = {}) {
  const type = String(messageType || '').trim().toLowerCase();
  if (type === 'audio') return '🎤 Audio';

  const text = String(body || '').replace(/\s+/g, ' ').trim();
  if (!text) return 'Nuevo mensaje';
  if (text.length <= PREVIEW_MAX) return text;
  return `${text.slice(0, PREVIEW_MAX - 1)}…`;
}

export function buildTripChatPushContent({ senderRole, messageType, body } = {}) {
  const preview = buildTripChatPushPreview({ messageType, body });
  const role = String(senderRole || '').trim().toLowerCase();

  if (role === 'driver') {
    return {
      title: 'Mensaje del conductor',
      body: preview,
      channelId: 'viajes',
    };
  }

  if (role === 'passenger') {
    return {
      title: 'Mensaje del pasajero',
      body: preview,
      channelId: 'messages',
    };
  }

  return {
    title: 'Nuevo mensaje',
    body: preview,
    channelId: 'viajes',
  };
}

/**
 * Notifica al receptor del mensaje (lado opuesto al senderRole).
 * No lanza: siempre devuelve { ok, reason? }.
 */
export async function notifyTripChatRecipient(supabase, {
  tripId,
  senderRole,
  messageType,
  body,
  messageId,
} = {}) {
  try {
    const normalizedTripId = String(tripId || '').trim();
    const role = String(senderRole || '').trim().toLowerCase();
    if (!supabase || !normalizedTripId) {
      return { ok: false, reason: 'missing_params' };
    }
    if (role !== 'driver' && role !== 'passenger') {
      return { ok: false, reason: 'invalid_sender_role' };
    }

    const { data: trip, error } = await supabase
      .from('trips')
      .select('id, status, passenger_phone, driver_id, passenger_name')
      .eq('id', normalizedTripId)
      .maybeSingle();

    if (error) throw error;
    if (!trip) return { ok: false, reason: 'trip_not_found' };

    const content = buildTripChatPushContent({
      senderRole: role,
      messageType,
      body,
    });

    const data = {
      type: 'trip_chat',
      tripId: trip.id,
      messageId: messageId || '',
      senderRole: role,
      messageType: String(messageType || 'text'),
      screen: 'ActiveTrip',
      openChat: '1',
    };

    if (role === 'driver') {
      // Chofer → pasajero
      if (!trip.passenger_phone) {
        return { ok: false, reason: 'missing_passenger_phone' };
      }
      const result = await sendPassengerPushByPhone(supabase, trip.passenger_phone, {
        title: content.title,
        body: content.body,
        data,
        channelId: content.channelId,
      });
      return { ...result, recipient: 'passenger' };
    }

    // Pasajero → chofer
    if (!trip.driver_id) {
      return { ok: false, reason: 'no_driver' };
    }
    const result = await sendDriverPushById(supabase, trip.driver_id, {
      title: content.title,
      body: content.body,
      data,
      channelId: content.channelId,
    });
    return { ...result, recipient: 'driver' };
  } catch (err) {
    console.warn('[tripChatPush]', err?.message || err);
    return { ok: false, reason: 'push_error', message: err?.message || null };
  }
}
