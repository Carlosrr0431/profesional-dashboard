'use client';

import { useMemo, useState } from 'react';
import { useGeocodeErrors } from '../hooks/useGeocodeErrors';
import { useToast } from '../context/ToastContext';

const FILTER_OPTIONS = [
  { key: 'pending', label: 'Pendientes' },
  { key: 'resolved', label: 'Resueltas' },
  { key: 'all', label: 'Todas' },
];

function formatWhen(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-AR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildSearchLabel(item) {
  const title = String(item?.title || '').trim();
  const subtitle = String(item?.subtitle || '').trim();
  const formatted = String(item?.formatted_address || item?.address || '').trim();

  if (title && subtitle) return `${title} · ${subtitle}`;
  if (title) return title;
  return formatted || '(sin texto)';
}

function buildExampleUrl(item) {
  const params = new URLSearchParams();
  if (item?.place_id) params.set('placeId', item.place_id);
  if (item?.formatted_address) params.set('formattedAddress', item.formatted_address);
  if (item?.title) params.set('title', item.title);
  if (item?.subtitle) params.set('subtitle', item.subtitle);
  if (item?.address) params.set('address', item.address);
  const qs = params.toString();
  return qs ? `/api/geo/geocode?${qs}` : '/api/geo/geocode';
}

export default function GeocodeErrorsPanel({ onBack }) {
  const toast = useToast();
  const {
    items,
    stats,
    filter,
    setFilter,
    loading,
    error,
    refetch,
    setResolved,
  } = useGeocodeErrors('pending');

  const [noteById, setNoteById] = useState({});
  const [busyId, setBusyId] = useState(null);

  const summary = useMemo(() => ({
    pending: stats.pending || 0,
    visible: items.length,
  }), [stats.pending, items.length]);

  const handleToggleResolved = async (item) => {
    const nextResolved = !item.resolved;
    setBusyId(item.id);
    try {
      await setResolved(item.id, nextResolved, noteById[item.id] || '');
      toast.success(nextResolved ? 'Búsqueda marcada como resuelta' : 'Búsqueda reabierta');
    } catch (err) {
      toast.error(err?.message || 'No se pudo actualizar');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col bg-[linear-gradient(180deg,#f8f9fc_0%,#eef1f6_100%)]">
      <div className="flex-shrink-0 px-5 py-4 border-b border-light-300/50 bg-white/90 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            className="w-9 h-9 rounded-xl border border-light-300/60 bg-white text-navy-900 hover:bg-light-100 transition-colors"
            title="Volver al mapa"
          >
            ←
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-navy-900 tracking-tight">Errores de geocodificación</h1>
            <p className="text-[12px] text-gray-500 mt-0.5">
              Búsquedas que fallaron o devolvieron coordenadas incorrectas en OSM/Nominatim.
            </p>
          </div>
          <button
            type="button"
            onClick={refetch}
            className="h-9 px-3 rounded-xl border border-light-300/60 bg-white text-[12px] font-medium text-navy-900 hover:bg-light-100"
          >
            Actualizar
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {FILTER_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setFilter(option.key)}
              className={`h-8 px-3 rounded-full text-[12px] font-medium transition-colors ${
                filter === option.key
                  ? 'bg-navy-900 text-white'
                  : 'bg-white border border-light-300/60 text-gray-600 hover:bg-light-100'
              }`}
            >
              {option.label}
              {option.key === 'pending' && summary.pending > 0 ? ` (${summary.pending})` : ''}
            </button>
          ))}
          <span className="text-[11px] text-gray-400 ml-auto">
            {summary.visible} registro{summary.visible === 1 ? '' : 's'} visibles
          </span>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-5">
        {loading ? (
          <div className="flex items-center justify-center h-40 text-sm text-gray-400">Cargando errores…</div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
            <p className="text-[12px] mt-2 text-rose-600">
              Verificá que ejecutaste el SQL de <code className="font-mono">geocode_error_logs.sql</code> en Supabase.
            </p>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-light-300/60 bg-white px-6 py-10 text-center">
            <p className="text-sm font-medium text-navy-900">No hay errores en esta vista</p>
            <p className="text-[12px] text-gray-400 mt-1">
              Cuando una búsqueda falle en <code className="font-mono">/api/geo/geocode</code>, aparecerá acá.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const exampleUrl = buildExampleUrl(item);
              return (
                <article
                  key={item.id}
                  className={`rounded-2xl border bg-white p-4 shadow-sm ${
                    item.resolved ? 'border-emerald-200/80' : 'border-rose-200/80'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <label className="flex items-start gap-2 cursor-pointer select-none pt-0.5">
                      <input
                        type="checkbox"
                        checked={Boolean(item.resolved)}
                        disabled={busyId === item.id}
                        onChange={() => handleToggleResolved(item)}
                        className="mt-1 h-4 w-4 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
                      />
                      <span className="text-[11px] text-gray-500 leading-5">
                        {item.resolved ? 'Resuelta' : 'Pendiente'}
                      </span>
                    </label>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-[14px] font-semibold text-navy-900 break-words">
                          {buildSearchLabel(item)}
                        </h2>
                        <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-100">
                          {item.occurrence_count || 1} vez{(item.occurrence_count || 1) === 1 ? '' : 'es'}
                        </span>
                      </div>

                      <p className="text-[12px] text-rose-700 mt-1 break-words">{item.error_message}</p>

                      <div className="mt-3 grid gap-2 text-[11px] text-gray-500 sm:grid-cols-2">
                        <p><span className="font-medium text-gray-600">Última vez:</span> {formatWhen(item.last_seen_at)}</p>
                        <p><span className="font-medium text-gray-600">Primera vez:</span> {formatWhen(item.created_at)}</p>
                        {item.place_id ? (
                          <p className="sm:col-span-2 break-all">
                            <span className="font-medium text-gray-600">placeId:</span> {item.place_id}
                          </p>
                        ) : null}
                        {item.formatted_address ? (
                          <p className="sm:col-span-2 break-words">
                            <span className="font-medium text-gray-600">formattedAddress:</span> {item.formatted_address}
                          </p>
                        ) : null}
                        {item.result_lat != null && item.result_lng != null ? (
                          <p className="sm:col-span-2 break-all">
                            <span className="font-medium text-gray-600">Coordenadas OSM reportadas:</span>{' '}
                            {Number(item.result_lat).toFixed(5)}, {Number(item.result_lng).toFixed(5)}
                          </p>
                        ) : null}
                      </div>

                      <details className="mt-3">
                        <summary className="text-[11px] font-medium text-navy-900 cursor-pointer">
                          Ver URL de ejemplo para reproducir
                        </summary>
                        <code className="mt-2 block text-[10px] break-all rounded-xl bg-light-100 px-3 py-2 text-gray-700">
                          {exampleUrl}
                        </code>
                      </details>

                      <div className="mt-3">
                        <input
                          type="text"
                          value={noteById[item.id] ?? item.resolved_note ?? ''}
                          onChange={(e) => setNoteById((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder="Nota opcional (ej: agregado POI en salta-known-pois)"
                          className="w-full rounded-xl border border-light-300/70 bg-light-50 px-3 py-2 text-[12px] text-navy-900 placeholder:text-gray-400 focus:outline-none focus:border-navy-700/20"
                        />
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
