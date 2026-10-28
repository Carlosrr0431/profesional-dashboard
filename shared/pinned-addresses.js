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
];

function foldPinnedQuery(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesSantaAnaPasaje20(norm) {
  const santaAna = /\bsanta ana\b/.test(norm);
  const pasaje20 = /\bpasaje\s*20\b/.test(norm);
  const casa = /\b1421\b/.test(norm);
  if (santaAna && pasaje20) return true;
  return casa && (santaAna || pasaje20);
}

function findPinnedAddress(query) {
  const norm = foldPinnedQuery(query);
  if (!norm || !matchesSantaAnaPasaje20(norm)) return null;
  return PINNED_ADDRESSES[0];
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
