'use client';

import { useEffect, useState } from 'react';
import { SpaButton } from '../shared/ui';
import {
  formatScheduleDisplay,
  isScheduleValid,
  minScheduleDate,
  parseDatetimeLocalValue,
  toDatetimeLocalValue,
} from './scheduleTrip';

export default function ScheduleTripModal({ open, busy, fareLabel, onClose, onConfirm }) {
  const [value, setValue] = useState(() => toDatetimeLocalValue(minScheduleDate()));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setValue(toDatetimeLocalValue(minScheduleDate()));
    setError('');
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const date = parseDatetimeLocalValue(value);
    if (!isScheduleValid(date)) {
      setError('Elegí un horario con al menos 30 minutos de anticipación.');
      return;
    }
    onConfirm({
      scheduledFor: date.toISOString(),
      scheduledDisplay: formatScheduleDisplay(date),
    });
  };

  return (
    <div className="spa-confirm" role="dialog" aria-modal="true" aria-labelledby="spa-schedule-title">
      <div className="spa-confirm-card">
        <h2 id="spa-schedule-title">Programar viaje</h2>
        {fareLabel ? <p className="spa-confirm-amount">{fareLabel}</p> : null}
        <p className="spa-confirm-body">Elegí día y hora. El móvil se pide en ese momento.</p>
        <label className="mt-4 grid gap-1.5 text-[12px] font-medium text-slate-500">
          Día y hora
          <input
            type="datetime-local"
            value={value}
            min={toDatetimeLocalValue(minScheduleDate())}
            onChange={(event) => setValue(event.target.value)}
            className="spa-field h-12 w-full rounded-2xl border-0 bg-light-100 px-4 text-base font-medium text-navy-900 outline-none"
          />
        </label>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <div className="spa-confirm-actions">
          <SpaButton variant="ghost" disabled={busy} onClick={onClose}>Volver</SpaButton>
          <SpaButton disabled={busy} onClick={submit}>{busy ? 'Guardando…' : 'Programar'}</SpaButton>
        </div>
      </div>
    </div>
  );
}
