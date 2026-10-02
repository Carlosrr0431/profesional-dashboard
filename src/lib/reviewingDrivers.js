const REVIEWING_DRIVER_LIMIT = 12;

function isMissingOffersTable(error) {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return code === '42P01' || code === 'PGRST205' || message.includes('trip_dispatch_offers');
}

function publicDriver(driver) {
  if (!driver?.id) return null;
  return {
    id: driver.id,
    full_name: String(driver.full_name || '').trim() || 'Conductor',
    photo_url: String(driver.photo_url || '').trim() || null,
    vehicle_brand: driver.vehicle_brand || null,
    vehicle_model: driver.vehicle_model || null,
  };
}

/** Choferes con la oferta abierta, en el orden en que les llegó. */
export function mapReviewingDrivers(offerDriverIds, drivers, assignedDriverId) {
  const ids = [];
  for (const raw of offerDriverIds || []) {
    const id = String(raw || '').trim();
    if (!id || ids.includes(id)) continue;
    ids.push(id);
    if (ids.length >= REVIEWING_DRIVER_LIMIT) break;
  }
  const assigned = String(assignedDriverId || '').trim();
  if (assigned && !ids.includes(assigned) && ids.length < REVIEWING_DRIVER_LIMIT) {
    ids.unshift(assigned);
  }
  const byId = new Map((drivers || []).filter((driver) => driver?.id).map((driver) => [driver.id, driver]));
  return ids.map((id) => publicDriver(byId.get(id))).filter(Boolean);
}

export async function loadReviewingDrivers(supabase, trip) {
  if (String(trip?.status || '') !== 'pending' || !trip?.id) return [];

  let offerDriverIds = [];
  const { data: offers, error: offerError } = await supabase
    .from('trip_dispatch_offers')
    .select('driver_id')
    .eq('trip_id', trip.id)
    .eq('status', 'pending')
    .order('offered_at', { ascending: true })
    .limit(REVIEWING_DRIVER_LIMIT);

  if (offerError) {
    if (!isMissingOffersTable(offerError)) throw offerError;
  } else {
    offerDriverIds = (offers || []).map((offer) => offer?.driver_id).filter(Boolean);
  }

  const ids = [...offerDriverIds];
  if (trip.driver_id && !ids.includes(trip.driver_id)) ids.unshift(trip.driver_id);
  if (!ids.length) return [];

  const { data: drivers, error: driverError } = await supabase
    .from('drivers')
    .select('id, full_name, photo_url, vehicle_brand, vehicle_model')
    .in('id', ids.slice(0, REVIEWING_DRIVER_LIMIT));
  if (driverError) throw driverError;

  return mapReviewingDrivers(offerDriverIds, drivers || [], trip.driver_id);
}
