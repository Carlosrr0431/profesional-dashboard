/**
 * Sube argentina-260618.osm.pbf a Supabase Storage (bucket público osm-data).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pbfPath = path.join(__dirname, '..', 'data', 'argentina-260618.osm.pbf');
const objectName = 'argentina-260618.osm.pbf';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceKey) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

if (!fs.existsSync(pbfPath)) {
  console.error(`No existe ${pbfPath}`);
  process.exit(1);
}

const base = supabaseUrl.replace(/\/$/, '');
const headers = {
  Authorization: `Bearer ${serviceKey}`,
  apikey: serviceKey,
};

async function ensureBucket() {
  const res = await fetch(`${base}/storage/v1/bucket`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: 'osm-data', name: 'osm-data', public: true }),
  });
  if (res.ok || res.status === 409) return;
  const text = await res.text();
  console.warn('[upload] bucket:', res.status, text);
}

async function upload() {
  const stat = fs.statSync(pbfPath);
  console.log(`[upload] Subiendo ${objectName} (${Math.round(stat.size / 1024 / 1024)} MB)...`);

  const body = fs.readFileSync(pbfPath);
  const res = await fetch(`${base}/storage/v1/object/osm-data/${objectName}`, {
    method: 'POST',
    headers: {
      ...headers,
      'Content-Type': 'application/octet-stream',
      'x-upsert': 'true',
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload falló ${res.status}: ${text}`);
  }

  const publicUrl = `${base}/storage/v1/object/public/osm-data/${objectName}`;
  console.log(publicUrl);
  return publicUrl;
}

await ensureBucket();
const url = await upload();
console.log(JSON.stringify({ ok: true, url }));
