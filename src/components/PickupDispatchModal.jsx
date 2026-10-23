'use client';

import { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { formatPickupLabel, mapPickupCaption } from '../lib/frequentPickups';

function BoltIcon({ className = 'h-4 w-4' }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

export default function PickupDispatchModal({ pickup, onClose, onDispatched }) {
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const { title, detail } = formatPickupLabel(pickup.address);
  const caption = mapPickupCaption(pickup.address) || title;
  const extra = [title, detail].find((part) => part && part !== caption) || '';
  const hourCount = Number(pickup.hourCount) || 0;
  const countLabel = `${pickup.count} ${pickup.count === 1 ? 'viaje' : 'viajes'} desde acá`;

  const dispatch = async () => {
    if (sending) return;
    setSending(true);
    try {
      const response = await fetch('/api/trips/create-queued', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'dashboard',
          pickupAddress: pickup.address,
          pickupLat: pickup.lat,
          pickupLng: pickup.lng,
          passengerName: null,
          passengerPhone: null,
        }),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) throw new Error(result?.message || 'No se pudo derivar el viaje.');
      toast.success(`Viaje derivado desde ${caption}. Buscando chofer…`);
      onDispatched?.(result.trip);
      onClose?.();
    } catch (err) {
      toast.error(err?.message || 'No se pudo derivar el viaje.');
      setSending(false);
    }
  };

  return (
    <div
      className="overflow-hidden rounded-3xl bg-white shadow-[0_20px_50px_rgba(15,23,42,0.22)] ring-1 ring-slate-200"
      role="dialog"
      aria-modal="true"
      aria-label={caption}
    >
      <div className="flex items-start gap-3 px-4 pb-3 pt-4">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-sm shadow-emerald-500/30">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 21s-6-5.33-6-11a6 6 0 1112 0c0 5.67-6 11-6 11z" />
            <circle cx="12" cy="10" r="2.1" strokeWidth={2} />
          </svg>
        </span>
        <div className="min-w-0 flex-1 pt-0.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Retiro</p>
          <h2 className="mt-0.5 text-[18px] font-bold leading-snug text-slate-900">{caption}</h2>
          {extra ? <p className="mt-0.5 text-[13px] font-medium leading-snug text-slate-500">{extra}</p> : null}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div className="mx-4 border-t border-slate-100" />

      <div className="px-4 pb-4 pt-3">
        <p className="text-[13px] font-semibold text-slate-700">
          <span className="tabular-nums">{countLabel}</span>
          {hourCount > 0 ? <span className="font-medium text-slate-400"> · {hourCount} a esta hora</span> : null}
        </p>
        <button
          type="button"
          disabled={sending}
          onClick={dispatch}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-[15px] font-bold text-white shadow-md shadow-emerald-500/25 transition hover:bg-emerald-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {sending ? <Spinner /> : <BoltIcon />}
          {sending ? 'Derivando…' : 'Derivar'}
        </button>
        <p className="mt-2 text-center text-[11px] font-medium text-slate-400">
          Entra en cola para el chofer libre más cercano.
        </p>
      </div>
    </div>
  );
}
