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

const require = createRequire(import.meta.url);
const { fuzzySearch } = require('../shared/geo/tomtomClient.js');

const queries = [
  'Imagenes Jaraba Salta',
  'Imágenes Jaraba Pueyrredón Salta',
  'jaraba salta',
];

for (const q of queries) {
  try {
    const hits = await fuzzySearch(q, { limit: 5, idxSet: 'POI,PAD,Addr,Str' });
    console.log(`\nTomTom Q: ${q} -> ${hits.length} hits`);
    hits.slice(0, 3).forEach((h, i) => {
      console.log(`  ${i + 1}. ${h.formattedAddress || h.address} (${h.lat}, ${h.lng}) poi=${h.poiName || '-'}`);
    });
  } catch (e) {
    console.log(`\nTomTom Q: ${q} -> ERROR: ${e.message}`);
  }
}
