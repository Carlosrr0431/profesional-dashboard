'use client';

import { useEffect, useRef, useState } from 'react';
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
  const incoming = humanNotesFromTrip(notes);
  const [localSaved, setLocalSaved] = useState(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(incoming);
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef(null);
  const saved = localSaved ?? incoming;
  const editable = canOperatorEditTripNotes({ id: tripId, status });
  const dirty = draft !== saved;

  useEffect(() => {
    setLocalSaved(null);
    setOpen(false);
    setDraft(humanNotesFromTrip(notes));
  }, [tripId]);

  useEffect(() => {
    const next = humanNotesFromTrip(notes);
    setLocalSaved((prev) => (prev != null && prev === next ? null : prev));
    if (!open) setDraft(next);
  }, [notes, open]);

  useEffect(() => {
    if (!open) return undefined;
    const node = textareaRef.current;
    if (node) {
      node.focus();
      const len = node.value.length;
      node.setSelectionRange(len, len);
    }
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) {
        setDraft(saved);
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, busy, saved]);

  if (!tripId) return null;
  if (!editable && !saved) return null;

  const openEditor = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!editable) return;
    setDraft(saved);
    setOpen(true);
  };

  const closeEditor = (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (busy) return;
    setDraft(saved);
    setOpen(false);
  };

  const send = async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    if (busy || !editable || !dirty) return;
    setBusy(true);
    try {
      const payload = await updateTripNotesAsOperator(tripId, draft);
      const next = humanNotesFromTrip(payload?.trip?.notes) || humanNotesFromTrip(draft);
      setLocalSaved(next);
      setDraft(next);
      setOpen(false);
      const waiting = ['queued', 'scheduled', 'pending'].includes(String(status || '').toLowerCase());
      toast.success(waiting ? 'Nota guardada' : 'Notas enviadas al chofer');
    } catch (err) {
      toast.error(err?.message || 'No se pudieron enviar las notas');
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <div
        className={`mt-3 ${className}`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        {saved ? (
          <p className="mb-2 line-clamp-2 text-[12px] leading-snug text-slate-600">
            {saved}
          </p>
        ) : null}
        {editable ? (
          <button
            type="button"
            onClick={openEditor}
            aria-expanded={false}
            className={compact
              ? 'flex h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white text-[13px] font-bold text-navy-800 transition-colors hover:bg-slate-50'
              : 'flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-[13px] font-bold text-navy-800 transition-colors hover:bg-slate-50'}
          >
            {saved ? 'Editar nota' : 'Agregar nota'}
          </button>
        ) : (
          <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
            Nota del viaje
          </p>
        )}
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white ${compact ? 'mt-3 p-2' : 'mt-3 p-2.5'} ${className}`}
      onClick={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
          {saved ? 'Editar nota' : 'Agregar nota'}
        </p>
        <span className="text-[10px] tabular-nums text-slate-400">
          {draft.length}/{HUMAN_TRIP_NOTES_MAX_LENGTH}
        </span>
      </div>
      <textarea
        ref={textareaRef}
        rows={compact ? 3 : 4}
        maxLength={HUMAN_TRIP_NOTES_MAX_LENGTH}
        disabled={!editable || busy}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={editable ? 'Datos adicionales del viaje…' : 'Este viaje ya no admite notas'}
        className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[12px] leading-snug text-slate-800 outline-none placeholder:text-slate-400 focus:border-navy-900 focus:bg-white focus:ring-2 focus:ring-navy-900/10 disabled:cursor-not-allowed disabled:text-slate-400"
      />
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={closeEditor}
          className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
        >
          Cerrar
        </button>
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
