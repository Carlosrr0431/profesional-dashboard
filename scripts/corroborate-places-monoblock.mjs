/**
 * Corrobora Places API (New) para "Monoblock salta":
 * Autocomplete + Place Details Essentials (sin Text Search / Geocoding legacy).
 * No imprime la API key.
 */
import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
for (const name of ['.env', '.env.local']) {
  const path = join(root, name);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

const originalFetch = globalThis.fetch.bind(globalThis);
const googleCalls = [];
globalThis.fetch = async (url, options) => {
  const urlStr = String(url);
  if (urlStr.includes('googleapis.com')) {
    googleCalls.push({
      url: urlStr,
      mask: options?.headers?.['X-Goog-FieldMask'] || options?.headers?.['x-goog-fieldmask'] || '',
    });
  }
  return originalFetch(url, options);
};

const require = createRequire(import.meta.url);
const {
  autocompleteAddressSalta,
  fetchPlaceDetailsEssentials,
  isGoogleConfigured,
  createSessionToken,
  PLACE_DETAILS_ESSENTIALS_MASK,
} = require('../shared/geo/googlePlaces.js');
const { isWithinSaltaCapital } = require('../shared/geo/mapConfig.js');

const FORBIDDEN = [
  /textsearch/i,
  /findplacefromtext/i,
  /places:searchText/i,
  /searchNearby/i,
  /maps\.googleapis\.com\/maps\/api\/place/i,
  /maps\.googleapis\.com\/maps\/api\/geocode/i,
];

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

if (!isGoogleConfigured()) {
  console.error('SKIP: no hay GOOGLE_MAPS_API_KEY en .env.local');
  process.exit(2);
}

const key = String(process.env.GOOGLE_MAPS_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '');
console.log(`Google key cargada (longitud ${key.length}, no se imprime). SKU esperado: Autocomplete New + Place Details Essentials (${PLACE_DETAILS_ESSENTIALS_MASK}).`);

const sessionToken = createSessionToken();
const query = 'Monoblock salta';
const hits = await autocompleteAddressSalta(query, 8, { sessionToken });

console.log(`\nAutocomplete New query="${query}" → ${hits.length} resultados (Capital):`);
hits.forEach((hit, index) => {
  console.log(`  ${index + 1}. ${hit.title} — ${hit.subtitle || '(sin subtítulo)'}`);
});

const blob = hits.map((hit) => `${hit.title} ${hit.subtitle}`).join('\n');
if (!/sarmiento/i.test(blob)) fail('no apareció Sarmiento');
if (!/25 de mayo/i.test(blob)) fail('no apareció 25 de Mayo');
if (hits.some((hit) => /jujuy/i.test(hit.subtitle || ''))) fail('quedó una sede fuera de Capital (Jujuy)');

const sarmiento = hits.find((hit) => /sarmiento/i.test(`${hit.title} ${hit.subtitle}`));
const mayo = hits.find((hit) => /25 de mayo/i.test(`${hit.title} ${hit.subtitle}`));

async function detailsFor(hit, label, token) {
  if (!hit?.placeId) {
    fail(`sin placeId para ${label}`);
    return null;
  }
  const details = await fetchPlaceDetailsEssentials(hit.placeId, {
    sessionToken: token,
    title: hit.title,
    subtitle: hit.subtitle,
    formattedAddress: hit.formattedAddress || hit.subtitle,
  });
  console.log(`\nPlace Details Essentials (${label}):`);
  console.log(`  address: ${details.formattedAddress}`);
  console.log(`  coords: ${details.lat}, ${details.lng}`);
  if (!isWithinSaltaCapital(details.lat, details.lng)) {
    fail(`${label} está fuera del rectángulo de Salta Capital`);
  }
  return details;
}

await detailsFor(sarmiento, 'Sarmiento', sessionToken);
await detailsFor(mayo, '25 de Mayo', createSessionToken());

for (const call of googleCalls) {
  for (const pattern of FORBIDDEN) {
    if (pattern.test(call.url)) fail(`SKU prohibido: ${call.url}`);
  }
  if (call.url.includes('places.googleapis.com/v1/places/') && !call.url.includes('autocomplete')) {
    if (String(call.mask).includes('displayName')) fail('Place Details usó displayName (Pro)');
    if (!String(call.mask).includes('location')) fail('Place Details sin location');
  }
}

const autocompleteCalls = googleCalls.filter((call) => call.url.includes('places:autocomplete'));
const detailsCalls = googleCalls.filter((call) => (
  call.url.includes('places.googleapis.com/v1/places/') && !call.url.includes('autocomplete')
));
console.log(`\nLlamadas Google: autocomplete=${autocompleteCalls.length} details=${detailsCalls.length}`);
if (autocompleteCalls.length < 1) fail('no hubo POST places:autocomplete');
if (detailsCalls.length < 1) fail('no hubo Place Details Essentials');

if (process.exitCode === 1) {
  console.error('\nCorroboración live: FALLÓ');
  process.exit(1);
}
console.log('\nCorroboración live: OK — Places API New devolvió los POIs de Maps y coords en Capital.');
