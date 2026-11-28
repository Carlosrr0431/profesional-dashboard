function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function authorized(request, env) {
  const header = request.headers.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  return Boolean(env.PLATFORM_SECRET) && token === env.PLATFORM_SECRET;
}

function nowIso() {
  return new Date().toISOString();
}

async function recordJob(env, job, ok, message) {
  await env.DB.prepare(
    'INSERT INTO cf_job_runs (job, ok, message, created_at) VALUES (?, ?, ?, ?)',
  ).bind(job, ok ? 1 : 0, String(message || '').slice(0, 500), nowIso()).run();
}

async function recordFailure(env, area, operation, message, detail) {
  await env.DB.prepare(
    'INSERT INTO cf_failures (area, operation, message, detail, created_at) VALUES (?, ?, ?, ?, ?)',
  ).bind(
    String(area || 'general').slice(0, 80),
    String(operation || 'unknown').slice(0, 80),
    String(message || 'Error').slice(0, 500),
    detail ? String(detail).slice(0, 2000) : null,
    nowIso(),
  ).run();
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') {
      try {
        const row = await env.DB.prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'cf_failures'",
        ).first();
        return json({ ok: true, database: Boolean(row), project: 'profesional' });
      } catch (error) {
        return json({ ok: false, message: error.message || 'D1 no responde' }, 500);
      }
    }
    if (!authorized(request, env)) return json({ ok: false, message: 'No autorizado' }, 401);
    try {
      if (request.method === 'GET' && url.pathname === '/failures') return listFailures(env);
      if (request.method === 'GET' && url.pathname === '/jobs') return listJobs(env);
      if (request.method === 'POST' && url.pathname === '/failures') return addFailure(request, env);
      if (request.method === 'POST' && url.pathname === '/mirror/trip') return mirrorTrip(request, env);
      if (request.method === 'POST' && url.pathname === '/mirror/driver') return mirrorDriver(request, env);
      return json({ ok: false, message: 'No encontrado' }, 404);
    } catch (error) {
      return json({ ok: false, message: error.message || 'Error de Cloudflare' }, 500);
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(runHeartbeat(env));
  },
};

async function runHeartbeat(env) {
  try {
    const trips = await env.DB.prepare('SELECT COUNT(*) AS total FROM trips').first();
    await recordJob(env, 'heartbeat', true, `D1 responde. Viajes copiados: ${Number(trips?.total || 0)}.`);
  } catch (error) {
    const message = error.message || 'El cron no pudo leer D1';
    try {
      await recordFailure(env, 'cron', 'heartbeat', message, null);
    } catch {
      // La propia tabla de fallas no está. El próximo request de salud lo va a mostrar.
    }
  }
}

async function listFailures(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, area, operation, message, detail, created_at FROM cf_failures ORDER BY id DESC LIMIT 80',
  ).all();
  return json({ ok: true, failures: results || [] });
}

async function listJobs(env) {
  const { results } = await env.DB.prepare(
    'SELECT id, job, ok, message, created_at FROM cf_job_runs ORDER BY id DESC LIMIT 20',
  ).all();
  return json({ ok: true, jobs: results || [] });
}

async function addFailure(request, env) {
  const body = await request.json().catch(() => ({}));
  await recordFailure(env, body.area, body.operation, body.message, body.detail);
  return json({ ok: true });
}

async function mirrorTrip(request, env) {
  const body = await request.json().catch(() => null);
  const id = String(body?.id || '').trim();
  if (!id) return json({ ok: false, message: 'Falta el viaje' }, 400);
  await env.DB.prepare(
    `INSERT INTO trips (
      id, status, driver_id, passenger_name, passenger_phone, origin_address, origin_lat, origin_lng,
      destination_address, destination_lat, destination_lng, notes, dispatch_status, next_after_trip_id,
      price, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      driver_id = excluded.driver_id,
      passenger_name = excluded.passenger_name,
      passenger_phone = excluded.passenger_phone,
      origin_address = excluded.origin_address,
      origin_lat = excluded.origin_lat,
      origin_lng = excluded.origin_lng,
      destination_address = excluded.destination_address,
      destination_lat = excluded.destination_lat,
      destination_lng = excluded.destination_lng,
      notes = excluded.notes,
      dispatch_status = excluded.dispatch_status,
      next_after_trip_id = excluded.next_after_trip_id,
      price = excluded.price,
      updated_at = excluded.updated_at`,
  ).bind(
    id,
    body.status || null,
    body.driver_id || null,
    body.passenger_name || null,
    body.passenger_phone || null,
    body.origin_address || null,
    numberOrNull(body.origin_lat),
    numberOrNull(body.origin_lng),
    body.destination_address || null,
    numberOrNull(body.destination_lat),
    numberOrNull(body.destination_lng),
    body.notes || null,
    body.dispatch_status || null,
    body.next_after_trip_id || null,
    numberOrNull(body.price),
    body.created_at || nowIso(),
    nowIso(),
  ).run();
  return json({ ok: true });
}

async function mirrorDriver(request, env) {
  const body = await request.json().catch(() => null);
  const id = String(body?.id || '').trim();
  if (!id) return json({ ok: false, message: 'Falta el chofer' }, 400);
  await env.DB.prepare(
    `INSERT INTO drivers (
      id, full_name, phone, is_online, is_available, current_lat, current_lng, driver_number, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      full_name = excluded.full_name,
      phone = excluded.phone,
      is_online = excluded.is_online,
      is_available = excluded.is_available,
      current_lat = excluded.current_lat,
      current_lng = excluded.current_lng,
      driver_number = excluded.driver_number,
      updated_at = excluded.updated_at`,
  ).bind(
    id,
    body.full_name || null,
    body.phone || null,
    body.is_online ? 1 : 0,
    body.is_available ? 1 : 0,
    numberOrNull(body.current_lat),
    numberOrNull(body.current_lng),
    numberOrNull(body.driver_number),
    nowIso(),
  ).run();
  return json({ ok: true });
}

function numberOrNull(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
