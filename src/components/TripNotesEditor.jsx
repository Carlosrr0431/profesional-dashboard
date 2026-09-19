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
  variant = 'card',
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
  const inline = variant === 'inline';
  const row = variant === 'row';

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

  if (!open && row) {
    if (!editable) return null;
    return (
      <div
        className={`min-w-0 flex-1 ${className}`}
        onClick={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={openEditor}
          aria-expanded={false}
          className="flex h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-[13px] font-bold text-navy-800 transition-colors hover:bg-slate-50"
        >
          {saved ? 'Editar nota' : 'Agregar nota'}
        </button>
      </div>
    );
  }

  if (!open && inline) {
    const rowClass = `flex w-full items-center gap-2 rounded-xl bg-white px-2.5 py-2 text-left ring-1 ring-slate-200/90 ${className}`;
    const body = (
      <>
        <span className={`min-w-0 flex-1 truncate text-[12.5px] leading-snug ${saved ? 'text-slate-800' : 'text-slate-400'}`}>
          {saved || 'Agregar nota para el chofer'}
        </span>
        {editable ? (
          <span className="shrink-0 rounded-full bg-navy-900 px-2.5 py-1 text-[11px] font-bold text-white">
            {saved ? 'Editar' : 'Agregar'}
          </span>
        ) : null}
      </>
    );
    if (!editable) {
      return (
        <div className={`mt-2 ${rowClass}`} onClick={(event) => event.stopPropagation()}>
          {body}
        </div>
      );
    }
    return (
      <button
        type="button"
        onClick={openEditor}
        aria-expanded={false}
        className={`mt-2 ${rowClass} transition hover:ring-slate-300`}
      >
        {body}
      </button>
    );
  }

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
      className={`rounded-xl border border-slate-200 bg-white ${row ? 'w-full basis-full p-2' : inline ? 'mt-2 p-2' : compact ? 'mt-3 p-2' : 'mt-3 p-2.5'} ${className}`}
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
        rows={inline || row ? 2 : compact ? 3 : 4}
        maxLength={HUMAN_TRIP_NOTES_MAX_LENGTH}
        disabled={!editable || busy}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        placeholder={editable ? 'Datos adicionales del viaje…' : 'Este viaje ya no admite notas'}
        className="w-full resize-y rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-[12px] leading-snug text-slate-800 outline-none placeholder:text-slate-400 focus:border-navy-900 focus:bg-white focus:ring-2 focus:ring-navy-900/10 disabled:cursor-not-allowed disabled:text-slate-400"
      />
      <div className="mt-2 flex items-stretch gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={closeEditor}
          className="flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-2xl border border-slate-200 bg-white px-4 text-[13px] font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 active:scale-[0.98] disabled:opacity-50"
        >
          <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4 shrink-0" aria-hidden>
            <path d="M5 5l10 10M15 5 5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          Cerrar
        </button>
        <button
          type="button"
          disabled={!editable || !dirty || busy}
          onClick={send}
          className="flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-navy-900 px-3 text-[13px] font-bold text-white shadow-sm transition hover:bg-navy-800 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0" aria-hidden>
            <path d="M2.35 2.18a.9.9 0 0 1 .98-.1l14.2 6.7a.9.9 0 0 1 0 1.64l-14.2 6.7a.9.9 0 0 1-1.28-1.05L3.7 11.3 11 10 3.7 8.7 2.05 3.13a.9.9 0 0 1 .3-.95Z" />
          </svg>
          <span className="truncate">{busy ? 'Enviando…' : 'Enviar al chofer'}</span>
        </button>
      </div>
    </div>
  );
}
