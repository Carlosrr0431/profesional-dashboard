import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

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

const base = process.env.NOMINATIM_BASE_URL || 'https://profesional-nominatim-production.up.railway.app';
const queries = [
  'Imagenes Jaraba, Salta, Argentina',
  'Imágenes Jaraba, Pueyrredón, Salta',
  'jaraba salta',
  'Imagenes Jaraba Pueyrredon',
  'Pueyrredón, Salta',
];

for (const q of queries) {
  const url = `${base}/search?${new URLSearchParams({
    q,
    format: 'jsonv2',
    limit: '8',
    countrycodes: 'ar',
    addressdetails: '1',
    viewbox: '-65.55,-24.90,-65.30,-24.70',
    bounded: '0',
  }).toString()}`;
  const response = await fetch(url, { headers: { 'User-Agent': 'ProfesionalApp-diag' } });
  const data = await response.json();
  console.log(`\nQ: ${q}`);
  console.log(`status=${response.status} hits=${Array.isArray(data) ? data.length : 0}`);
  if (Array.isArray(data)) {
    for (const [i, hit] of data.slice(0, 5).entries()) {
      console.log(`  ${i + 1}. name=${hit.name || '-'} class=${hit.class}/${hit.type} lat=${hit.lat} lon=${hit.lon}`);
      console.log(`     ${String(hit.display_name || '').slice(0, 100)}`);
    }
  }
}
