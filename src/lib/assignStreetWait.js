import { isCoordLikeAddress } from '../../shared/trip-contract.js';

/** Tope para no frenar el botón de asignar si el geocoder está lento. */
export const ASSIGN_STREET_WAIT_MS = 800;

/** Cuando la calle llega tarde, reemplaza las coordenadas ya guardadas. */
export async function saveOriginStreetLater(supabase, tripId, streetPromise, currentAddress) {
  let street = null;
  try {
    street = await streetPromise;
  } catch {
    return;
  }
  const next = String(street || '').trim();
  const current = String(currentAddress || '').trim();
  if (!next || !current || next === current || isCoordLikeAddress(next) || !isCoordLikeAddress(current)) return;
  await supabase
    .from('trips')
    .update({ origin_address: next })
    .eq('id', tripId)
    .eq('origin_address', current);
}

/**
 * Espera la calle como máximo `timeoutMs`. Si no llega, devuelve null
 * y la promesa original sigue corriendo para completarla después.
 */
export function waitForStreetAddress(promise, timeoutMs = ASSIGN_STREET_WAIT_MS) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    Promise.resolve(promise).then(
      (value) => finish(value ?? null),
      () => finish(null),
    );
  });
}
