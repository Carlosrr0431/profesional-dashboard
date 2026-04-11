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
