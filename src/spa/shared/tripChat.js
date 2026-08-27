export const TRIP_CHAT_ACTIVE_STATUSES = ['accepted', 'going_to_pickup', 'in_progress'];
export const TRIP_CHAT_MAX_TEXT_LENGTH = 500;
export const TRIP_CHAT_MESSAGE_FIELDS =
  'id, trip_id, sender_role, message_type, body, audio_url, audio_duration_seconds, created_at, client_id, seen_at';

export function isTripChatAvailable(status) {
  return TRIP_CHAT_ACTIVE_STATUSES.includes(String(status || '').toLowerCase());
}

export function formatChatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString('es-AR', {
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function buildTripTrackingUrl(tokenOrTripId) {
  const token = String(tokenOrTripId || '').trim();
  if (!token) return null;
  const origin = typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin
    : 'https://www.profesionalviajes.com.ar';
  return `${origin.replace(/\/+$/, '')}/seguimiento/${encodeURIComponent(token)}`;
}

export function mergeChatMessage(list, message) {
  if (!message?.id && !message?.client_id) return list;
  const exists = list.some(
    (item) => (message.id && item.id === message.id)
      || (message.client_id && item.client_id && item.client_id === message.client_id),
  );
  if (exists) {
    return list.map((item) => {
      if (message.id && item.id === message.id) return { ...item, ...message };
      if (message.client_id && item.client_id === message.client_id) return { ...item, ...message };
      return item;
    });
  }
  return [...list, message].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
}
