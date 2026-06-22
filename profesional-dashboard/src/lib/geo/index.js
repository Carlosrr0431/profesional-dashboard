/**
 * Servicios geoespaciales del dashboard (Nominatim/OSM + Georef + OSRM routing).
 */
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const mapConfig = require('../../../shared/geo/mapConfig');
const nominatim = require('../../../shared/geo/nominatim');
const osrm = require('../../../shared/geo/osrm');
const { decodePolyline } = require('../../../shared/geo/polyline');

export const {
  MAP_STYLE_URL,
  TOMTOM_API_KEY,
  TOMTOM_LANGUAGE,
  TOMTOM_COUNTRY_SET,
  TOMTOM_VIEW,
  SALTA_CENTER_LAT,
  SALTA_CENTER_LNG,
  SALTA_SEARCH_RADIUS_M,
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
  getPassengerFareRoute,
} = osrm;

export { decodePolyline };
