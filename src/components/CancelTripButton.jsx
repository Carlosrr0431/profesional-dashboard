'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useToast } from '../context/ToastContext';
import { cancelTripAsOperator } from '../lib/cancelTripAsOperatorClient';

export default function CancelTripButton({
  tripId,
  onCancelled,
  compact = false,
  className = '',
  passengerName = '',
  address = '',
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy]);

  if (!tripId) return null;

  const close = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (busy) return;
    setOpen(false);
  };

  const handleConfirm = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await cancelTripAsOperator(tripId);
      toast.success('Viaje cancelado');
      setOpen(false);
      onCancelled?.();
    } catch (err) {
      toast.error(err?.message || 'No se pudo cancelar el viaje');
    } finally {
      setBusy(false);
    }
  };

  const dialog = open && typeof document !== 'undefined'
    ? createPortal(
      <div
        className="fixed inset-0 z-[11000] flex items-center justify-center bg-slate-950/45 p-4"
        onClick={close}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-trip-title"
          className="w-full max-w-[360px] rounded-[24px] border border-slate-200 bg-white p-5 shadow-[0_28px_64px_-20px_rgba(15,23,42,0.45)]"
          onClick={(event) => event.stopPropagation()}
        >
          <p id="cancel-trip-title" className="text-[17px] font-bold tracking-tight text-slate-900">
            ¿Cancelar este viaje?
          </p>
          <p className="mt-1 text-[13px] leading-snug text-slate-500">
            Revisá que sea el correcto. Esta acción no se puede deshacer.
          </p>
          {passengerName || address ? (
            <div className="mt-4 rounded-2xl bg-slate-50 px-3.5 py-3">
              {passengerName ? (
                <p className="text-[13px] font-bold text-slate-900">{passengerName}</p>
              ) : null}
              {address ? (
                <p className="mt-0.5 text-[12px] leading-snug text-slate-500">{address}</p>
              ) : null}
            </div>
          ) : null}
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={close}
              disabled={busy}
              className="h-12 rounded-2xl border border-slate-200 bg-white text-[14px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              No
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy}
              className="h-12 rounded-2xl bg-rose-600 text-[14px] font-semibold text-white transition-colors hover:bg-rose-700 disabled:opacity-50"
            >
              {busy ? 'Cancelando…' : 'Sí, cancelar'}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <div className={className}>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        disabled={busy}
        className={compact
          ? 'flex h-11 w-full items-center justify-center rounded-2xl border border-rose-200 bg-white text-[13px] font-bold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50'
          : 'flex h-10 items-center justify-center rounded-xl border border-rose-200 bg-white px-4 text-[13px] font-bold text-rose-700 transition-colors hover:bg-rose-50 disabled:opacity-50'}
      >
        Cancelar
      </button>
      {dialog}
    </div>
  );
}
