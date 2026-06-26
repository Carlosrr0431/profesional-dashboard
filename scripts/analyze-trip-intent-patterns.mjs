/**
 * Analiza chats/messages legacy (Profesional_App) y mide cuántos mensajes
 * se resuelven por patrones vs cuántos necesitarían DeepSeek.
 *
 * Uso:
 *   cd profesional-dashboard
 *   node scripts/analyze-trip-intent-patterns.mjs
 *   node scripts/analyze-trip-intent-patterns.mjs --limit-chats 200 --dry-run
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import {
  buildPatternTripExtraction,
  classifyWhatsAppIncomingText,
  shouldUsePatternExtraction,
} from '../src/lib/whatsappTripIntentPatterns.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_ROOT = path.resolve(__dirname, '..');
const CHAT_OWNER = process.env.WHATSAPP_CHAT_OWNER || 'Profesional_App';
const PAGE_SIZE = 1000;

function loadEnvFile(relativePath) {
  const filePath = path.join(DASHBOARD_ROOT, relativePath);
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

loadEnvFile('.env');
loadEnvFile('.env.local');

function parseArgs(argv) {
  const opts = { limitChats: null, dryRun: false, out: path.join(DASHBOARD_ROOT, 'data', 'trip-intent-analysis.json') };
  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') opts.dryRun = true;
    else if (arg === '--limit-chats') opts.limitChats = Number(argv[++i]);
    else if (arg === '--out') opts.out = path.resolve(argv[++i]);
  }
  return opts;
}

async function fetchAll(supabase, table, buildQuery) {
  const rows = [];
  let from = 0;
  for (;;) {
    let q = supabase.from(table).select('*').range(from, from + PAGE_SIZE - 1);
    q = buildQuery(q);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return rows;
}

async function main() {
  const opts = parseArgs(process.argv);
  const url = process.env.KNOWLEDGE_SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.KNOWLEDGE_SUPABASE_SERVICE_ROLE_KEY ||
    process.env.KNOWLEDGE_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    console.error('Configurá NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY');
    process.exit(1);
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let chats = await fetchAll(supabase, 'chats', (q) =>
    q.eq('propietario', CHAT_OWNER).order('updated_at', { ascending: false })
  );
  if (opts.limitChats) chats = chats.slice(0, opts.limitChats);

  const chatIds = chats.map((c) => c.id);
  const messages = [];
  for (let i = 0; i < chatIds.length; i += 80) {
    const chunk = chatIds.slice(i, i + 80);
    const batch = await fetchAll(supabase, 'messages', (q) =>
      q.in('chat_id', chunk).eq('propietario', CHAT_OWNER).order('message_timestamp', { ascending: true })
    );
    messages.push(...batch);
  }

  const stats = {
    exportedAt: new Date().toISOString(),
    owner: CHAT_OWNER,
    chats: chats.length,
    messages: messages.length,
    incoming: 0,
    patternResolved: 0,
    needsDeepSeek: 0,
    byCategory: {},
    byIntent: {},
    samplesNeedingAi: [],
  };

  for (const msg of messages) {
    if (msg.direction !== 'incoming') continue;
    const content = String(msg.content || '').trim();
    if (!content) continue;

    stats.incoming += 1;
    const classified = classifyWhatsAppIncomingText(content, { messageType: msg.type });
    stats.byCategory[classified.category] = (stats.byCategory[classified.category] || 0) + 1;

    const extraction = buildPatternTripExtraction({
      combinedText: content,
      heuristics: { looksLikeTripRequest: classified.intentHint === 'trip_request', pickup: null, destination: null },
    });

    if (shouldUsePatternExtraction(extraction)) {
      stats.patternResolved += 1;
      stats.byIntent[extraction.intent] = (stats.byIntent[extraction.intent] || 0) + 1;
    } else {
      stats.needsDeepSeek += 1;
      if (stats.samplesNeedingAi.length < 40) {
        stats.samplesNeedingAi.push({ content: content.slice(0, 160), category: classified.category });
      }
    }
  }

  const patternPct = stats.incoming ? ((stats.patternResolved / stats.incoming) * 100).toFixed(1) : '0';
  console.log(`Mensajes entrantes: ${stats.incoming}`);
  console.log(`Resueltos por patrón (sin IA): ${stats.patternResolved} (${patternPct}%)`);
  console.log(`Necesitarían DeepSeek: ${stats.needsDeepSeek}`);

  if (!opts.dryRun) {
    fs.mkdirSync(path.dirname(opts.out), { recursive: true });
    fs.writeFileSync(opts.out, `${JSON.stringify(stats, null, 2)}\n`, 'utf8');
    console.log(`Guardado: ${opts.out}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
