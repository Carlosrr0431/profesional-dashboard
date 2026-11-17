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
  {
    id: 'senora-del-carmen-mza-f50-lote-210',
    title: 'Señora del Carmen, Mza F50, Lote 210',
    subtitle: 'Salta',
    lat: -24.782338,
    lng: -65.4369189,
  },
  {
    id: 'ing-abel-cornejo-751',
    title: 'Ing. Abel Cornejo 751',
    subtitle: 'Salta',
    lat: -24.7973297,
    lng: -65.4363874,
    number: '751',
    aliases: [
      'Marcelino Cornejo 751',
      'Cap Marcelino Cornejo 751',
      'Ing Abel Cornejo 751',
      'Ingeniero Abel Cornejo 751',
    ],
  },
  {
    id: 'av-independencia-392',
    title: 'Av. Independencia 392',
    subtitle: 'Salta',
    lat: -24.8083069,
    lng: -65.4104266,
    number: '392',
    aliases: [
      'Avenida Independencia 392',
      'Independencia 392',
    ],
  },
];

const { savedAddressMatches, queryOverlapScore, foldPinnedQuery } = require('./savedAddressMatch');

function pinLabels(item) {
  return [item.title, ...(item.aliases || [])];
}

function pinNumberMatches(item, query) {
  if (!item.number) return true;
  return foldPinnedQuery(query).split(' ').includes(String(item.number));
}

function findPinnedAddresses(query) {
  return PINNED_ADDRESSES
    .filter((item) => pinNumberMatches(item, query) && pinLabels(item).some((label) => savedAddressMatches(label, query)))
    .sort((a, b) => {
      const best = (item) => Math.max(...pinLabels(item).map((label) => queryOverlapScore(query, label)));
      return best(b) - best(a);
    });
}

function findPinnedAddress(query) {
  return findPinnedAddresses(query)[0] || null;
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
  PINNED_ADDRESSES,
  findPinnedAddresses,
  findPinnedAddress,
  pinnedAddressSuggestion,
  pinnedAddressById,
};
