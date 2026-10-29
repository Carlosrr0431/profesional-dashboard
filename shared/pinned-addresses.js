/**
 * Direcciones que el mapa oficial no nombra y deben caer siempre en el mismo punto.
 * El pin es el de Google Maps (3d/4d), no el centro de la vista.
 */
const PINNED_ADDRESSES = [
  {
    id: 'santa-ana-pasaje-20-casa-1421',
    title: 'Santa Ana 1, Pasaje 20, Casa 1421',
    subtitle: 'Salta',
    lat: -24.8638868,
    lng: -65.4731354,
  },
  {
    id: 'santa-rita-2-la-isla-manzana-20-casa-5',
    title: 'Santa Rita 2, La Isla, Manzana 20, Casa 5',
    subtitle: 'Salta',
    lat: -24.8772243,
    lng: -65.4034545,
  },
  {
    id: 'barrio-rio-ancho-casa-2-gomeria',
    title: 'Barrio Río Ancho, Casa 2, Gomería',
    subtitle: 'Salta',
    lat: -24.8533069,
    lng: -65.4045727,
  },
];

const { savedAddressMatches } = require('./savedAddressMatch');

function findPinnedAddress(query) {
  return PINNED_ADDRESSES.find((item) => savedAddressMatches(item.title, query)) || null;
}

function pinnedAddressSuggestion(item) {
  const formattedAddress = `${item.title}, ${item.subtitle}`;
  return {
    title: item.title,
    subtitle: item.subtitle,
    address: formattedAddress,
    formattedAddress,
    lat: item.lat,
    lng: item.lng,
    placeId: `pinned:${item.id}`,
    geocodeSource: 'pinned',
  };
}

function pinnedAddressById(placeId) {
  const id = String(placeId || '').replace(/^pinned:/, '').trim();
  return PINNED_ADDRESSES.find((item) => item.id === id) || null;
}

module.exports = {
  findPinnedAddress,
  pinnedAddressSuggestion,
  pinnedAddressById,
};
