import { getSupabaseAdmin } from './supabaseAdmin';
import { fetchAllPages, SUPABASE_PAGE_SIZE } from './pagedQuery';
import { isWithinServiceArea } from './constants';
import { buildFrequentPickups, buildFrequentPlaces } from './frequentPickups';

const CACHE_MS = 5 * 60_000;
const TRIP_SELECT = 'id, status, origin_address, origin_lat, origin_lng, destination_address, destination_lat, destination_lng, notes, created_at, scheduled_for';

let cached = null;
let inflight = null;

async function loadTrips() {
  if (cached && cached.expires > Date.now()) return cached.trips;
  if (!inflight) {
    inflight = (async () => {
      const supabase = getSupabaseAdmin();
      const trips = await fetchAllPages(async (from, to) => {
        const { data, error } = await supabase
          .from('trips')
          .select(TRIP_SELECT)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to);
        if (error) throw error;
        return data || [];
      }, SUPABASE_PAGE_SIZE, 6);
      cached = { trips, expires: Date.now() + CACHE_MS };
      return trips;
    })().finally(() => { inflight = null; });
  }
  return inflight;
}

export async function loadFrequentPickups() {
  return buildFrequentPickups(await loadTrips(), { isAllowed: isWithinServiceArea });
}

export async function loadFrequentPlaces() {
  return buildFrequentPlaces(await loadTrips(), { isAllowed: isWithinServiceArea });
}
