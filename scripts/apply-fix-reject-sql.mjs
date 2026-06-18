import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv('../.env');
loadEnv('../.env.local');

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const accessToken = process.env.SUPABASE_ACCESS_TOKEN || '';
const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1] || '';

const sqlPath = path.join(root, '../../driver-app/supabase/fix_trips_rls_driver_reject.sql');
const sql = fs.readFileSync(sqlPath, 'utf8');

if (!accessToken || !projectRef) {
  console.log('Para aplicar automáticamente, exportá SUPABASE_ACCESS_TOKEN (supabase login) y volvé a correr este script.');
  console.log('O ejecutá manualmente en Supabase SQL Editor:');
  console.log(sqlPath);
  process.exit(1);
}

const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ query: sql }),
});

const payload = await response.json().catch(() => ({}));
if (!response.ok) {
  console.error('APPLY_FAILED', response.status, payload);
  process.exit(1);
}

console.log('SQL aplicado correctamente.');
