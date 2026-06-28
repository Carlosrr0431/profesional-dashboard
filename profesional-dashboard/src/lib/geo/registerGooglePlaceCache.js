import { setGooglePlacePersistentCache } from '../../../shared/geo/googlePlaces.js';
import {
  getCachedGooglePlaceDetails,
  upsertGooglePlaceDetailsCache,
} from '../googlePlaceDetailsCache.js';

let registered = false;

/**
 * Registra la caché Supabase como capa persistente antes de llamar a Place Details Essentials.
 */
export function registerGooglePlaceSupabaseCache() {
  if (registered) return;
  registered = true;

  setGooglePlacePersistentCache({
    get: getCachedGooglePlaceDetails,
    upsert: upsertGooglePlaceDetailsCache,
  });
}
