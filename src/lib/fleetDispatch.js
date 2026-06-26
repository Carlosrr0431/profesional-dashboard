/** Utilidades compartidas para derivación y mapa con titulares + choferes asignados. */

export function getFleetRootId(driver) {
  if (!driver?.id) return null;
  return driver.owner_id || driver.id;
}

export function isAssignedDriverRow(driver) {
  return Boolean(driver?.owner_id) || driver?.is_assigned_driver === true;
}

/** rootId → Set(memberId) */
export function buildFleetMembersByRoot(drivers) {
  const map = new Map();
  for (const driver of drivers || []) {
    if (!driver?.id) continue;
    const rootId = getFleetRootId(driver);
    if (!map.has(rootId)) map.set(rootId, new Set());
    map.get(rootId).add(driver.id);
  }
  return map;
}

export function buildDriverRootIndex(drivers) {
  const index = new Map();
  for (const driver of drivers || []) {
    if (driver?.id) index.set(driver.id, getFleetRootId(driver));
  }
  return index;
}

/** Si un miembro del móvil tiene viaje activo, todo el vehículo queda ocupado. */
export function expandBusyDriverIdsToFleet(drivers, busyDriverIds) {
  const rawIds = busyDriverIds instanceof Set ? [...busyDriverIds] : (busyDriverIds || []);
  const busy = new Set(rawIds.filter(Boolean));
  if (!busy.size) return busy;

  const membersByRoot = buildFleetMembersByRoot(drivers);
  const rootIndex = buildDriverRootIndex(drivers);
  const expanded = new Set(busy);

  for (const busyId of busy) {
    const rootId = rootIndex.get(busyId) || busyId;
    const members = membersByRoot.get(rootId);
    if (!members) continue;
    for (const memberId of members) expanded.add(memberId);
  }

  return expanded;
}

/** rootId → viaje activo de cualquier miembro del móvil */
export function buildFleetActiveTripByRoot(drivers, activeTrips) {
  const rootIndex = buildDriverRootIndex(drivers);
  const fleetActiveTrip = new Map();

  for (const trip of activeTrips || []) {
    if (!trip?.driver_id) continue;
    const rootId = rootIndex.get(trip.driver_id) || trip.driver_id;
    if (!fleetActiveTrip.has(rootId)) {
      fleetActiveTrip.set(rootId, trip);
    }
  }

  return fleetActiveTrip;
}

export function resolveFleetActiveTrip(driver, fleetActiveTripByRoot) {
  const rootId = getFleetRootId(driver);
  if (!rootId || !fleetActiveTripByRoot) return null;
  return fleetActiveTripByRoot.get(rootId) || null;
}
