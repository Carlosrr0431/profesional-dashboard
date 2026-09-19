'use client';

import { useEffect, useState } from 'react';
import {
  cleanTripNotesForDriverDisplay,
  HUMAN_TRIP_NOTES_MAX_LENGTH,
} from '../../shared/trip-contract.js';
import { useToast } from '../context/ToastContext';
import { canOperatorEditTripNotes } from '../lib/updateTripNotesAsOperator';
import { updateTripNotesAsOperator } from '../lib/updateTripNotesAsOperatorClient';

function humanNotesFromTrip(notes) {
  return cleanTripNotesForDriverDisplay(notes) || '';
}

export default function TripNotesEditor({
  tripId,
  notes,
  status,
  compact = false,
  className = '',
}) {
  const toast = useToast();
  const saved = humanNotesFromTrip(notes);
  const [draft, setDraft] = useState(saved);
  const [busy, setBusy] = useState(false);
  const editable = canOperatorEditTripNotes({ id: tripId, status });
  const dirty = draft !== saved;

  useEffect(() => {
    setDraft(humanNotesFromTrip(notes));
  }, [tripId, notes]);

  if (!tripId) return null;

  const send = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (busy || !editable || !dirty) return;
    setBusy(true);
    try {
      await updateTripNotesAsOperator(tripId, draft);
      toast.success('Notas enviadas al chofer');
    } catch (err) {
      toast.error(err?.message || 'No se pudieron enviar las notas');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white ${compact ? 'mt-2.5 p-2' : 'mt-3 p-2.5'} ${className}`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
          Notas para el chofer
        </p>
        <span className="text-[10px] tabular-nums text-slate-400">
          {draft.length}/{HUMAN_TRIP_NOTES_MAX_LENGTH}
        </span>
      </div>
      <textarea
        rows={compact ? 2 : 3}
        maxLength={HUMAN_TRIP_NOTES_MAX_LENGTH}
        disabled={!editable || busy}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={editable ? 'Datos adicionales del viaje…' : 'Este viaje ya no admite notas'}
        className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[12px] leading-snug text-slate-800 outline-none placeholder:text-slate-400 focus:border-navy-900 focus:bg-white focus:ring-2 focus:ring-navy-900/10 disabled:cursor-not-allowed disabled:text-slate-400"
      />
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] leading-snug text-slate-400">
          {editable ? 'El chofer lo ve al instante.' : 'Viaje cerrado.'}
        </p>
        <button
          type="button"
          disabled={!editable || !dirty || busy}
          onClick={send}
          className="shrink-0 rounded-lg bg-navy-900 px-2.5 py-1 text-[11px] font-bold text-white transition hover:bg-navy-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
        >
          {busy ? 'Enviando…' : 'Enviar al chofer'}
        </button>
      </div>
    </div>
  );
}
