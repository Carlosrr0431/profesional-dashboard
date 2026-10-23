'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DockCard } from './MapDockPopovers';
import { useToast } from '../context/ToastContext';
import {
  PICKUP_WINDOW_MINUTES,
  artMinuteOfDay,
  filterPickups,
  formatArtMinute,
  formatPickupLabel,
  rankPickupsForMinute,
} from '../lib/frequentPickups';

const FRESH_MS = 5 * 60_000;
const TOP_LIMIT = 50;
const SEARCH_LIMIT = 80;

let cache = { items: null, at: 0 };
let pending = null;

export function loadFrequentPickups() {
  if (cache.items && Date.now() - cache.at < FRESH_MS) return Promise.resolve(cache.items);
  if (!pending) {
    pending = fetch('/api/admin/frequent-pickups', { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok || !body?.ok) {
          throw new Error(body?.message || 'No se pudieron cargar los retiros frecuentes.');
        }
        cache = { items: body.items || [], at: Date.now() };
        return cache.items;
      })
      .finally(() => { pending = null; });
  }
  return pending;
}

function BoltIcon({ className = 'h-3.5 w-3.5' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function PickupRow({ item, rank, maxHour, sending, disabled, onPick }) {
  const { title, detail } = formatPickupLabel(item.address);
  const hot = item.hourCount > 0;
  const share = hot ? Math.max(6, Math.round((item.hourCount / maxHour) * 100)) : 0;
  const meta = [detail, hot ? `${item.count} en total` : null].filter(Boolean).join(' · ');
  const podium = rank != null && rank <= 3;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onPick(item)}
      title={`Derivar viaje desde ${item.address}`}
      className={`group flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-left transition-all active:scale-[0.99] disabled:cursor-not-allowed ${
        sending
          ? 'border-emerald-300 bg-emerald-50'
          : 'border-slate-100 bg-slate-50/80 hover:border-emerald-200 hover:bg-emerald-50/60 disabled:opacity-50'
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-[12px] font-black tabular-nums ${
          podium ? 'bg-emerald-500 text-white shadow-sm shadow-emerald-500/30' : 'bg-white text-slate-500 ring-1 ring-slate-200'
        }`}
      >
        {rank ?? (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21s-6-5.33-6-11a6 6 0 1112 0c0 5.67-6 11-6 11z" />
            <circle cx="12" cy="10" r="2.2" strokeWidth={2} />
          </svg>
        )}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-bold leading-tight text-slate-900">{title}</span>
        {meta ? (
          <span className="mt-0.5 block truncate text-[11px] font-medium text-slate-500">{meta}</span>
        ) : null}
        <span className="mt-1.5 block h-1 overflow-hidden rounded-full bg-slate-200/70">
          <span className="block h-full rounded-full bg-emerald-400" style={{ width: `${share}%` }} />
        </span>
      </span>

      <span className="flex w-[3.75rem] shrink-0 flex-col items-end whitespace-nowrap">
        <span className={`text-[15px] font-black leading-none tabular-nums ${hot ? 'text-emerald-600' : 'text-slate-500'}`}>
          {hot ? item.hourCount : item.count}
        </span>
        <span className="mt-0.5 text-[10px] font-semibold text-slate-400">
          {hot ? 'a esta hora' : (item.count === 1 ? 'viaje' : 'viajes')}
        </span>
      </span>

      <span
        className={`flex h-8 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11px] font-bold transition-colors ${
          sending
            ? 'bg-emerald-500 text-white'
            : 'bg-white text-emerald-700 ring-1 ring-emerald-200 group-hover:bg-emerald-500 group-hover:text-white group-hover:ring-emerald-500'
        }`}
      >
        {sending ? <Spinner /> : <BoltIcon />}
        {sending ? 'Derivando' : 'Derivar'}
      </span>
    </button>
  );
}

export default function ExpressDispatchPopover({ onDispatched }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [items, setItems] = useState(cache.items);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sendingId, setSendingId] = useState(null);

  const reload = useCallback(() => {
    setError('');
    loadFrequentPickups().then(setItems).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    reload();
    if (window.matchMedia('(min-width: 768px)').matches) inputRef.current?.focus();
  }, [reload]);

  const [minute] = useState(() => artMinuteOfDay());
  const ranked = useMemo(() => rankPickupsForMinute(items || [], minute), [items, minute]);
  const maxHour = useMemo(() => ranked.reduce((max, item) => Math.max(max, item.hourCount), 0), [ranked]);
  const searching = Boolean(query.trim());
  const results = useMemo(
    () => filterPickups(ranked, query, searching ? SEARCH_LIMIT : TOP_LIMIT),
    [ranked, query, searching],
  );

  const dispatch = async (item) => {
    if (sendingId) return;
    setSendingId(item.id);
    try {
      const response = await fetch('/api/trips/create-queued', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'dashboard',
          pickupAddress: item.address,
          pickupLat: item.lat,
          pickupLng: item.lng,
          passengerName: null,
          passengerPhone: null,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error(result?.message || 'No se pudo derivar el viaje.');
      toast.success(`Viaje derivado desde ${formatPickupLabel(item.address).title}. Buscando chofer…`);
      onDispatched?.(result.trip);
    } catch (err) {
      toast.error(err?.message || 'No se pudo derivar el viaje.');
      setSendingId(null);
    }
  };

  let body;
  if (!items && error) {
    body = (
      <div className="rounded-2xl bg-rose-50 px-3 py-6 text-center">
        <p className="text-[12px] font-semibold text-rose-700">{error}</p>
        <button
          type="button"
          onClick={reload}
          className="mt-3 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-rose-700 shadow-sm ring-1 ring-rose-200 hover:bg-rose-100"
        >
          Reintentar
        </button>
      </div>
    );
  } else if (!items) {
    body = (
      <div className="space-y-1.5" aria-label="Cargando retiros">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="h-[58px] animate-pulse rounded-2xl bg-slate-100" />
        ))}
      </div>
    );
  } else if (results.length === 0) {
    body = (
      <div className="rounded-2xl bg-slate-50 px-3 py-8 text-center">
        <p className="text-[12px] font-semibold text-slate-600">
          {searching ? `Ningún retiro coincide con “${query.trim()}”` : 'Todavía no hay retiros para mostrar'}
        </p>
        <p className="mt-1 text-[11px] text-slate-400">Para una dirección nueva usá “Nuevo viaje”.</p>
      </div>
    );
  } else {
    body = (
      <ul className="space-y-1.5">
        {results.map((item, index) => (
          <li key={item.id}>
            <PickupRow
              item={item}
              rank={searching ? null : index + 1}
              maxHour={maxHour}
              sending={sendingId === item.id}
              disabled={Boolean(sendingId)}
              onPick={dispatch}
            />
          </li>
        ))}
      </ul>
    );
  }

  const roundedMinute = Math.round(minute / 5) * 5;
  const windowLabel = `${formatArtMinute(roundedMinute - PICKUP_WINDOW_MINUTES)} a ${formatArtMinute(roundedMinute + PICKUP_WINDOW_MINUTES)}`;
  let resultLabel = 'Retiros más pedidos';
  if (searching) {
    resultLabel = `${results.length >= SEARCH_LIMIT ? `${SEARCH_LIMIT}+` : results.length} ${results.length === 1 ? 'resultado' : 'resultados'}`;
  } else if (maxHour > 0) {
    resultLabel = `Más pedidos a esta hora · ${windowLabel}`;
  }

  return (
    <DockCard
      tone="emerald"
      title="Express"
      meta={items ? `${items.length.toLocaleString('es-AR')} retiros` : 'Cargando…'}
      footer={(
        <p className="border-t border-slate-100 bg-slate-50 px-4 py-2.5 text-[11px] font-medium text-slate-500">
          Un toque y el viaje entra en cola para el chofer libre más cercano.
        </p>
      )}
    >
      <div className="sticky top-0 z-10 -mx-2.5 bg-white px-2.5 pb-2">
        <label className="flex h-11 items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 transition focus-within:border-emerald-400 focus-within:bg-white focus-within:ring-4 focus-within:ring-emerald-500/15">
          <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M11 19a8 8 0 100-16 8 8 0 000 16z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar calle, altura o lugar…"
            aria-label="Buscar retiro"
            autoComplete="off"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => { setQuery(''); inputRef.current?.focus(); }}
              aria-label="Borrar búsqueda"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-slate-500 transition hover:bg-slate-300"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          ) : null}
        </label>
        <p className="mt-2 px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">{resultLabel}</p>
      </div>
      {body}
    </DockCard>
  );
}
