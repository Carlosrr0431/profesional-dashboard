/**
 * Geocodificación vía dashboard (mismo flujo que TripAssignModal / AddressAutocomplete).
 */
const shared = require('../../shared/geo/dashboardGeoApi');
const placeResolve = require('../../shared/geo/geoPlaceResolve');

export const geocodeAddress = shared.geocodeAddress;
export const geocodeAddressMultiple = shared.geocodeAddressMultiple;
export const reverseGeocode = shared.reverseGeocode;
export const autocompleteAddressSalta = shared.autocompleteAddressSalta;
export const getPlaceDetails = shared.getPlaceDetails;
export const readDashboardUrl = shared.readDashboardUrl;

export const {
  firstAddressLine,
  buildSelectedAddressLabel,
  isCoordinateFallbackText,
  resolvePlaceFromSuggestion,
} = placeResolve;
