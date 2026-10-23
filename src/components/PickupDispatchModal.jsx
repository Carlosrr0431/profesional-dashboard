'use client';

import { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { formatPickupLabel } from '../lib/frequentPickups';

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
  const hourCount = Number(pickup.hourCount) || 0;

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
      toast.success(`Viaje derivado desde ${title}. Buscando chofer…`);
      onDispatched?.(result.trip);
      onClose?.();
    } catch (err) {
      toast.error(err?.message || 'No se pudo derivar el viaje.');
      setSending(false);
    }
  };

  return (
    <div
      className="overflow-hidden rounded-[28px] bg-white shadow-[0_24px_64px_rgba(15,23,42,0.28)] ring-1 ring-black/5"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="relative bg-gradient-to-br from-emerald-600 via-emerald-500 to-teal-500 px-5 pb-8 pt-4 text-white">
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.4} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/70">Punto de retiro</p>
        <h2 className="mt-1 pr-8 text-[20px] font-black leading-tight tracking-tight">{title}</h2>
        {detail ? <p className="mt-1 text-[13px] font-medium text-white/80">{detail}</p> : null}
      </div>

      <div className="-mt-4 px-5 pb-5">
        <div className="flex flex-wrap gap-2 rounded-2xl bg-white px-3 py-3 shadow-sm ring-1 ring-slate-100">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[12px] font-bold text-emerald-700">
            <span className="tabular-nums">{pickup.count}</span>
            {pickup.count === 1 ? 'viaje' : 'viajes'}
          </span>
          {hourCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-50 px-2.5 py-1 text-[12px] font-bold text-teal-700">
              <span className="tabular-nums">{hourCount}</span>
              a esta hora
            </span>
          ) : null}
        </div>

        <button
          type="button"
          disabled={sending}
          onClick={dispatch}
          className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-500 text-[15px] font-black text-white shadow-lg shadow-emerald-500/30 transition hover:bg-emerald-400 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-70"
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
