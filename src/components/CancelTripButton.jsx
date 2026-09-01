'use client';

import { useState } from 'react';
import { useToast } from '../context/ToastContext';
import { cancelTripAsOperator } from '../lib/cancelTripAsOperatorClient';

export default function CancelTripButton({
  tripId,
  onCancelled,
  compact = false,
  className = '',
}) {
  const toast = useToast();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!tripId) return null;

  const handleClick = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (busy) return;
    if (!confirm) {
      setConfirm(true);
      return;
    }

    setBusy(true);
    try {
      await cancelTripAsOperator(tripId);
      toast.success('Viaje cancelado');
      onCancelled?.();
    } catch (err) {
      toast.error(err?.message || 'No se pudo cancelar el viaje');
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };

  const handleAbort = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setConfirm(false);
  };

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        disabled={busy}
        className={compact
          ? `rounded-lg px-2 py-1 text-[10.5px] font-semibold transition-colors disabled:opacity-50 ${
            confirm
              ? 'bg-rose-600 text-white hover:bg-rose-700'
              : 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'
          }`
          : `rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all disabled:opacity-50 ${
            confirm
              ? 'bg-danger text-white hover:bg-danger/80'
              : 'border border-transparent text-danger/70 hover:border-danger/20 hover:bg-danger/8 hover:text-danger'
          }`}
      >
        {busy ? '...' : confirm ? '¿Confirmar?' : 'Cancelar'}
      </button>
      {confirm && !busy ? (
        <button
          type="button"
          onClick={handleAbort}
          className="px-1.5 py-1 text-[10.5px] text-slate-400 hover:text-slate-600"
        >
          No
        </button>
      ) : null}
    </div>
  );
}
