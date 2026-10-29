'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAdminAuth } from '../hooks/useAdminAuth';
import { useToast } from '../context/ToastContext';
import {
  ensurePinnedAddressSync,
  focusPinnedAddress,
  removePinnedAddressRow,
  upsertPinnedAddressRow,
  usePinnedAddressFocusId,
  usePinnedAddresses,
} from '../lib/pinnedAddressStore';

function parsePreviewPoint(input) {
  let text = String(input || '').trim();
  if (!text) return null;
  try { text = decodeURIComponent(text); } catch { /* ya decodificado */ }
  const pin = text.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/);
  const query = text.match(/[?&]q=(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/i);
  const at = text.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  const pair = text.match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  const match = pin || query || at || pair;
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function formatPoint(lat, lng) {
  return `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}`;
}

export default function PinnedAddressesPanel({ onBack, onShowOnMap }) {
  const toast = useToast();
  const { getAccessToken } = useAdminAuth();
  const rows = usePinnedAddresses();
  const focusId = usePinnedAddressFocusId();
  const [title, setTitle] = useState('');
  const [pointText, setPointText] = useState('');
  const [filter, setFilter] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState('');

  const preview = parsePreviewPoint(pointText);
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((row) => row.title.toLowerCase().includes(needle));
  }, [rows, filter]);

  useEffect(() => {
    ensurePinnedAddressSync();
  }, []);

  const authHeaders = useCallback(async () => {
    const token = await getAccessToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, [getAccessToken]);

  const show = (row) => {
    focusPinnedAddress(row.id);
    onShowOnMap?.(row);
  };

  const save = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/geo/pinned-addresses', {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ title, point: pointText }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload.error || 'No se pudo guardar.');
      upsertPinnedAddressRow(payload.data);
      setTitle('');
      setPointText('');
      show(payload.data);
      toast.success('Dirección guardada. Ya está en el mapa.');
    } catch (error) {
      toast.error(error.message || 'No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  };

  const rename = async (row) => {
    const nextTitle = draft.trim().replace(/\s+/g, ' ');
    setEditingId(null);
    if (!nextTitle || nextTitle === row.title) return;
    upsertPinnedAddressRow({ ...row, title: nextTitle });
    try {
      const response = await fetch('/api/geo/pinned-addresses', {
        method: 'PATCH',
        headers: await authHeaders(),
        body: JSON.stringify({ id: row.id, title: nextTitle }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload.error || 'No se pudo renombrar.');
      upsertPinnedAddressRow(payload.data);
      show(payload.data);
    } catch (error) {
      upsertPinnedAddressRow(row);
      toast.error(error.message || 'No se pudo renombrar.');
    }
  };

  const remove = async (row) => {
    removePinnedAddressRow(row.id);
    try {
      const response = await fetch(`/api/geo/pinned-addresses?id=${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
        headers: await authHeaders(),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload?.ok) throw new Error(payload.error || 'No se pudo quitar.');
    } catch (error) {
      upsertPinnedAddressRow(row);
      toast.error(error.message || 'No se pudo quitar.');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-white/70 bg-white/95 shadow-2xl shadow-slate-900/15 backdrop-blur-md">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-rose-500">Mapa en vivo</p>
          <h1 className="text-[16px] font-semibold text-slate-900">Direcciones fijas</h1>
        </div>
        <button type="button" onClick={onBack} className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-slate-500 hover:bg-slate-100">
          Cerrar
        </button>
      </header>

      <form
        className="border-b border-slate-100 px-4 py-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!saving) save();
        }}
      >
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Nombre, por ejemplo Barrio Río Ancho, Casa 2"
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-900 outline-none focus:border-rose-300 focus:bg-white"
        />
        <textarea
          value={pointText}
          onChange={(event) => setPointText(event.target.value)}
          rows={2}
          placeholder="Pegá el enlace de Google Maps"
          className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-[13px] text-slate-900 outline-none focus:border-rose-300 focus:bg-white"
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className={`text-[12px] ${preview ? 'text-emerald-700' : 'text-slate-400'}`}>
            {preview ? formatPoint(preview.lat, preview.lng) : 'Falta el punto del mapa'}
          </p>
          <button
            type="submit"
            disabled={saving || title.trim().length < 4 || !preview}
            className="rounded-full bg-rose-600 px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-40"
          >
            {saving ? 'Guardando…' : 'Agregar'}
          </button>
        </div>
      </form>

      <div className="px-4 py-2">
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Buscar dirección"
          className="w-full rounded-full border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-rose-300"
        />
        <p className="mt-1.5 text-[11px] text-slate-400">{visible.length} de {rows.length}</p>
      </div>

      <ul className="min-h-0 flex-1 overflow-auto px-2 pb-3">
        {visible.length === 0 ? (
          <li className="px-3 py-6 text-center text-[13px] text-slate-400">Ninguna dirección coincide.</li>
        ) : null}
        {visible.map((row) => {
          const selected = row.id === focusId;
          const editing = editingId === row.id;
          return (
            <li key={row.id} className={`mb-1 rounded-2xl px-2 py-2 ${selected ? 'bg-rose-50' : 'hover:bg-slate-50'}`}>
              <div className="flex items-start gap-2">
                <button type="button" onClick={() => show(row)} className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500" aria-label="Ver en el mapa" />
                <div className="min-w-0 flex-1">
                  {editing ? (
                    <input
                      autoFocus
                      value={draft}
                      onChange={(event) => setDraft(event.target.value)}
                      onBlur={() => rename(row)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') event.currentTarget.blur();
                        if (event.key === 'Escape') setEditingId(null);
                      }}
                      className="w-full rounded-lg border border-rose-200 px-2 py-1 text-[13px] font-semibold text-slate-900 outline-none"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => show(row)}
                      onDoubleClick={() => {
                        setEditingId(row.id);
                        setDraft(row.title);
                      }}
                      className="block w-full truncate text-left text-[13px] font-semibold text-slate-900"
                    >
                      {row.title}
                    </button>
                  )}
                  <p className="text-[11px] text-slate-400">{formatPoint(row.lat, row.lng)}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(row.id);
                    setDraft(row.title);
                  }}
                  className="text-[12px] font-semibold text-slate-500"
                >
                  Editar
                </button>
                <button type="button" onClick={() => remove(row)} className="text-[12px] font-semibold text-rose-600">
                  Quitar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
