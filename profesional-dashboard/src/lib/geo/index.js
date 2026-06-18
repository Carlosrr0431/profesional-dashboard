/**
 * Servicios geoespaciales del dashboard (Nominatim + OSRM).
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const mapConfig = require('../../../shared/geo/mapConfig');
const nominatim = require('../../../shared/geo/nominatim');
const osrm = require('../../../shared/geo/osrm');
const { decodePolyline } = require('../../../shared/geo/polyline');

export const {
  MAP_STYLE_URL,
  OSRM_BASE_URL,
  NOMINATIM_BASE_URL,
  NOMINATIM_USER_AGENT,
  NOMINATIM_SELF_HOSTED,
  SALTA_VIEWBOX,
  SALTA_COUNTRY,
} = mapConfig;

export const {
  geocodeAddress,
  geocodeAddressMultiple,
  reverseGeocode,
  autocompleteAddressSalta,
  getPlaceDetails,
} = nominatim;

export const {
  getRouteMetrics,
  getDirectionsResponse,
  getRouteMetricsByAddress,
  getRouteAlternatives,
} = osrm;

export { decodePolyline };
