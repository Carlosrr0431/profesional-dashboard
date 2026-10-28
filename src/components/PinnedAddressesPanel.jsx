'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useToast } from '../context/ToastContext';

function parsePreviewPoint(input) {
  const text = String(input || '').trim();
  const pin = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const at = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const pair = text.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  const match = pin || at || pair;
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function formatPoint(lat, lng) {
  return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
}

export default function PinnedAddressesPanel({ onBack }) {
  const toast = useToast();
  const { getAccessToken } = useAdminAuth();
  const [rows, setRows] = useState([]);
  const [title, setTitle] = useState('');
  const [pointText, setPointText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const preview = parsePreviewPoint(pointText);

  const authHeaders = useCallback(async () => {
    const token = await getAccessToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, [getAccessToken]);

  const loadRows = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/geo/pinned-addresses', { cache: 'no-store' });
      const payload = await response.json();
      if (!payload?.ok) throw new Error(payload?.error || 'No se pudieron cargar las direcciones.');
      setRows(Array.isArray(payload.data) ? payload.data : []);
    } catch (error) {
      toast.error(error.message || 'No se pudieron cargar las direcciones.');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/geo/pinned-addresses', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ title, point: pointText }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) {
        throw new Error(payload.error || 'No se pudo guardar.');
      }
      setTitle('');
      setPointText('');
      toast.success('Dirección guardada. Ya se puede buscar en todas las apps.');
      await loadRows();
    } catch (error) {
      toast.error(error.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id) => {
    try {
      const response = await fetch(`/api/geo/pinned-addresses?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: await authHeaders(),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload.error || 'No se pudo borrar.');
      setRows((current) => current.filter((row) => row.id !== id));
    } catch (error) {
      toast.error(error.message || 'No se pudo borrar.');
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-col bg-slate-50">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <button type="button" onClick={onBack} className="rounded-lg px-2 py-1 text-sm text-slate-600 hover:bg-slate-100">
          Volver
        </button>
        <div>
          <h1 className="text-base font-semibold text-slate-900">Direcciones fijas</h1>
          <p className="text-xs text-slate-500">El nombre que escribas es el que hay que buscar en el panel, WhatsApp y las apps.</p>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 overflow-auto p-4">
        <form
          className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
          onSubmit={(event) => {
            event.preventDefault();
            if (!saving) save();
          }}
        >
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Nombre de la dirección
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Santa Ana 1, Pasaje 20, Casa 1421"
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            />
          </label>
          <label className="mt-3 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Enlace de Google Maps o latitud y longitud
            <textarea
              value={pointText}
              onChange={(event) => setPointText(event.target.value)}
              rows={3}
              placeholder="https://www.google.com/maps/place/..."
              className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-900"
            />
          </label>
          <p className="mt-2 text-sm text-slate-600">
            {preview
              ? `Punto leído: ${formatPoint(preview.lat, preview.lng)}`
              : 'Todavía no se lee un punto. Pegá el enlace completo de Google Maps.'}
          </p>
          <button
            type="submit"
            disabled={saving || title.trim().length < 4 || !preview}
            className="mt-3 rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? 'Guardando…' : 'Guardar dirección'}
          </button>
        </form>

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          {loading ? <p className="p-4 text-sm text-slate-500">Cargando…</p> : null}
          {!loading && rows.length === 0 ? (
            <p className="p-4 text-sm text-slate-500">Todavía no hay direcciones cargadas desde acá. Si la tabla no existe, hay que ejecutar el SQL en Supabase.</p>
          ) : null}
          <ul>
            {rows.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3 border-t border-slate-100 px-4 py-3 first:border-t-0">
                <div>
                  <p className="text-sm font-semibold text-slate-900">{row.title}</p>
                  <p className="text-xs text-slate-500">{formatPoint(row.lat, row.lng)}</p>
                </div>
                <button type="button" onClick={() => remove(row.id)} className="text-sm text-rose-600">
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
