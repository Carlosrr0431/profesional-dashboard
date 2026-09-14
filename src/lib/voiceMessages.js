export function mergeVoiceMessage(list, message) {
  if (!message?.id) return Array.isArray(list) ? list : [];
  const prev = Array.isArray(list) ? list : [];
  if (prev.some((item) => item.id === message.id)) {
    return prev.map((item) => (item.id === message.id ? { ...item, ...message } : item));
  }
  return [...prev, message].sort((a, b) => (
    new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  ));
}

export function mergeVoiceMessages(list, incoming = []) {
  return (incoming || []).reduce((acc, message) => mergeVoiceMessage(acc, message), list || []);
}

export function isUnreadDriverVoice(message) {
  return String(message?.sender_type || '') === 'driver'
    && message?.is_played !== true
    && Boolean(message?.audio_url);
}

export function summarizeIncomingDriverVoice(messages, drivers = []) {
  const byDriver = new Map();
  for (const msg of messages || []) {
    if (!isUnreadDriverVoice(msg) || !msg.driver_id) continue;
    const driverId = String(msg.driver_id);
    const ts = new Date(msg.created_at || 0).getTime() || 0;
    const prev = byDriver.get(driverId);
    if (!prev) {
      byDriver.set(driverId, {
        driverId,
        count: 1,
        latestAt: ts,
        ids: [msg.id],
      });
      continue;
    }
    prev.count += 1;
    prev.ids.push(msg.id);
    if (ts >= prev.latestAt) prev.latestAt = ts;
  }

  const driverById = new Map((drivers || []).map((driver) => [String(driver.id), driver]));
  return [...byDriver.values()]
    .sort((a, b) => b.latestAt - a.latestAt)
    .map((item) => {
      const driver = driverById.get(item.driverId) || null;
      return {
        ...item,
        driver,
        name: driver?.fullName || 'Chofer',
        driverNumber: driver?.driverNumber ?? null,
      };
    });
}

export function unreadVoiceCountForDriver(incoming, driverId) {
  const id = String(driverId || '');
  if (!id) return 0;
  return (incoming || []).find((row) => row.driverId === id)?.count || 0;
}

export function firstNameFromFullName(name) {
  return String(name || 'Chofer').trim().split(/\s+/)[0] || 'Chofer';
}
