/**
 * Elige a todos los choferes del anillo más cercano que tenga alguien.
 * No se ofrece de a uno: el primero que acepta se queda con el viaje.
 */
export function selectNearestRing(candidates, radii) {
  const rings = (Array.isArray(radii) ? radii : [])
    .map((km) => Number(km))
    .filter((km) => Number.isFinite(km) && km > 0);
  const pool = Array.isArray(candidates) ? candidates : [];

  for (const radiusKm of rings) {
    const inRing = pool.filter((item) => (
      item?.driver?.id && Number(item.distanceKm) <= radiusKm
    ));
    if (inRing.length > 0) {
      return { radiusKm, drivers: inRing };
    }
  }

  return null;
}
