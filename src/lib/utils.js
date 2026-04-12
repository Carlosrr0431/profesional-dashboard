export function timeAgo(dateStr) {
  if (!dateStr) return 'N/A';
  const now = new Date();
  const date = new Date(dateStr);
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 10) return 'ahora';
  if (seconds < 60) return `hace ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours}h`;
  const days = Math.floor(hours / 24);
  return `hace ${days}d`;
}

export function formatSpeed(speed) {
  if (!speed || speed < 0.5) return '0 km/h';
  return `${Math.round(speed * 3.6)} km/h`;
}

export function formatPrice(price) {
  if (price == null) return '$0';
  return `$${Number(price).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

export function formatKm(km) {
  if (km == null) return '0 km';
  return `${Number(km).toFixed(1)} km`;
}

export function formatDuration(minutes) {
  if (minutes == null) return '0 min';
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hrs = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  return `${hrs}h ${mins}m`;
}

export function formatDateTime(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

export function formatTime(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

const STATUS_MAP = {
  pending: { label: 'Pendiente', color: 'text-warning', bg: 'bg-warning/15' },
  accepted: { label: 'Aceptado', color: 'text-accent', bg: 'bg-accent/15' },
  going_to_pickup: { label: 'En camino', color: 'text-accent-light', bg: 'bg-accent/15' },
  in_progress: { label: 'En curso', color: 'text-online', bg: 'bg-online/15' },
  completed: { label: 'Completado', color: 'text-online', bg: 'bg-online/15' },
  cancelled: { label: 'Cancelado', color: 'text-danger', bg: 'bg-danger/15' },
};

export function getTripStatus(status) {
  return STATUS_MAP[status] || { label: status, color: 'text-gray-400', bg: 'bg-dark-600/50' };
}

/**
 * Send Expo push notification to a driver's device
 */
export async function sendPushNotification(pushToken, { title, body, data = {} }) {
  if (!pushToken) {
    console.warn('No push token available for driver');
    return;
  }

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        to: pushToken,
        title,
        body,
        data,
        sound: 'default',
        priority: 'high',
        channelId: 'trips',
        badge: 1,
      }),
    });

    const result = await response.json();
    if (result.data?.status === 'error') {
      console.error('Push notification error:', result.data.message);
    }
    return result;
  } catch (error) {
    console.error('Failed to send push notification:', error);
  }
}
