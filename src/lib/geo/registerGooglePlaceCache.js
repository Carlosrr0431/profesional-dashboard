import { setGooglePlacePersistentCache, setPlacesBudget } from '../../../shared/geo/googlePlaces.js';
import {
  getCachedGooglePlaceDetails,
  upsertGooglePlaceDetailsCache,
} from '../googlePlaceDetailsCache.js';
import {
  getCachedPlacesSearch,
  savePlacesSearch,
  tryConsumePlacesCall,
} from '../googlePlacesBudgetStore.js';

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
  setPlacesBudget({
    tryConsume: tryConsumePlacesCall,
    getSearch: getCachedPlacesSearch,
    saveSearch: savePlacesSearch,
  });
}
