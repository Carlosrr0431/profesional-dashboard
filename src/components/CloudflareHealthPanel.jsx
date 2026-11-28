'use client';

import { useCallback, useEffect, useState } from 'react';

const SURFACES = [
  {
    name: 'Chats de WhatsApp',
    now: 'D1 en profesional-chats',
    fallback: 'Si falla el guardado, el mensaje de WhatsApp sigue. El error queda en este registro.',
  },
  {
    name: 'Viajes, choferes, GPS y login',
    now: 'Supabase, con copia lista en D1',
    fallback: 'Sigue siendo la fuente que ven las apps. No se corta el viaje si Cloudflare falla.',
  },
  {
    name: 'Tiempo real del mapa',
    now: 'Supabase Realtime',
    fallback: 'D1 no reemplaza el canal en vivo. Se mantiene hasta sacar el respaldo.',
  },
  {
    name: 'Cron de despacho, agente y SMS',
    now: 'Vercel, cada minuto',
    fallback: 'Cloudflare late cada minuto en D1 y no vuelve a disparar el despacho, para no asignar dos veces.',
  },
];

function formatWhen(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

export default function CloudflareHealthPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/cloudflare/status', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.ok === false) {
        throw new Error(payload?.message || 'No se pudo leer el estado.');
      }
      setData(payload);
    } catch (err) {
      setError(err?.message || 'No se pudo leer el estado.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const failures = data?.failures || [];
  const jobs = data?.jobs || [];

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-slate-50">
      <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div>
          <h1 className="text-[16px] font-bold text-slate-900">Cloudflare</h1>
          <p className="text-[12px] text-slate-500">
            Supabase sigue activo. Acá se ve qué parte de Cloudflare falló para poder sacarlo después.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[12px] font-semibold text-slate-700"
        >
          Actualizar
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {loading ? <p className="text-sm text-slate-500">Leyendo Cloudflare…</p> : null}
        {error ? <p className="mb-3 text-sm font-medium text-rose-600">{error}</p> : null}
        {data && !data.configured ? (
          <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
            Falta conectar el worker. En el servidor tienen que estar CLOUDFLARE_PLATFORM_URL y CLOUDFLARE_PLATFORM_SECRET.
          </p>
        ) : null}

        <section className="mb-4 grid gap-2 md:grid-cols-2">
          {SURFACES.map((item) => (
            <article key={item.name} className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
              <h2 className="text-[13px] font-bold text-slate-900">{item.name}</h2>
              <p className="mt-1 text-[12px] text-slate-600">Ahora: {item.now}</p>
              <p className="mt-1 text-[12px] text-slate-500">{item.fallback}</p>
            </article>
          ))}
        </section>

        <section className="mb-4 rounded-2xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-100 px-3 py-2 text-[13px] font-bold text-slate-900">
            Fallas ({failures.length})
          </h2>
          {failures.length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-slate-500">No hay fallas registradas.</p>
          ) : (
            <ul>
              {failures.map((item) => (
                <li key={item.id} className="border-b border-slate-100 px-3 py-2 last:border-0">
                  <p className="text-[12px] font-semibold text-rose-700">
                    {item.area} · {item.operation}
                  </p>
                  <p className="text-[13px] text-slate-800">{item.message}</p>
                  <p className="text-[11px] text-slate-400">{formatWhen(item.created_at)}</p>
                  {item.detail ? (
                    <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap text-[11px] text-slate-500">{item.detail}</pre>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white">
          <h2 className="border-b border-slate-100 px-3 py-2 text-[13px] font-bold text-slate-900">Latido del cron</h2>
          {jobs.length === 0 ? (
            <p className="px-3 py-3 text-[13px] text-slate-500">Todavía no hay corridas.</p>
          ) : (
            <ul>
              {jobs.map((item) => (
                <li key={item.id} className="border-b border-slate-100 px-3 py-2 text-[13px] last:border-0">
                  <span className={item.ok ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'}>
                    {item.ok ? 'OK' : 'Fallo'}
                  </span>
                  {' '}{item.job}: {item.message}
                  <span className="ml-2 text-[11px] text-slate-400">{formatWhen(item.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
