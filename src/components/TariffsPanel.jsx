'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import ZoneManagement from './ZoneManagement';
import {
  artTimeContext,
  minutesToTimeInput,
  pickMatchingWindow,
  resolveChannelTariff,
} from '../lib/resolveTariff';
import {
  TARIFF_CHANNEL_META,
  WEEKDAY_OPTIONS,
  digitsOnly,
  draftFromWindow,
  emptyWindowDraft,
  exampleTripBreakdown,
  formatWindowHours,
  formatWindowScheduleLabel,
  moneyAr,
  settingsMapFromTariffDefaults,
  sortTariffWindows,
  timelinePercent,
  windowSegmentsForCalendarDay,
  windowSourceLabel,
} from '../lib/tariffUi';

const CHANNEL_ORDER = ['platform', 'passenger_app', 'passenger_web'];
const KM_PRESETS = [3, 5, 8, 12];
const HOUR_MARKS = [0, 6, 12, 18, 24];

function artClockLabel(date) {
  return new Intl.DateTimeFormat('es-AR', {
    timeZone: 'America/Argentina/Buenos_Aires',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function Field({ label, prefix, value, onChange, suffix }) {
  return (
    <label className="flex min-w-0 flex-1 flex-col gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</span>
      <span className="relative block">
        {prefix ? (
          <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[15px] font-semibold text-slate-400">
            {prefix}
          </span>
        ) : null}
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={String(value ?? '')}
          onChange={(event) => onChange(digitsOnly(event.target.value))}
          className={`h-14 w-full rounded-2xl border border-slate-200 bg-white text-[20px] font-semibold tabular-nums text-navy-900 outline-none transition focus:border-navy-900/35 focus:ring-4 focus:ring-navy-900/8 ${
            prefix ? 'pl-8 pr-4' : 'px-4'
          } ${suffix ? 'pr-11' : ''}`}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[14px] font-semibold text-slate-400">
            {suffix}
          </span>
        ) : null}
      </span>
    </label>
  );
}

function QuoteBreakdown({ km, example }) {
  return (
    <div className="rounded-[24px] bg-navy-900 px-5 py-5 text-white sm:px-6">
      <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-white/45">
        Cotizador · viaje de {km} km
      </p>
      <p className="mt-2 text-[36px] font-semibold tabular-nums leading-none tracking-tight">
        {moneyAr(example.price)}
      </p>
      <p className="mt-2 text-[15px] text-white/60">Total que paga el pasajero</p>
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl bg-white/10 px-4 py-4">
          <p className="text-[13px] font-medium text-white/55">Comisión</p>
          <p className="mt-1 text-[24px] font-semibold tabular-nums leading-none">{moneyAr(example.commission)}</p>
        </div>
        <div className="rounded-2xl bg-white/10 px-4 py-4">
          <p className="text-[13px] font-medium text-white/55">Para el chofer</p>
          <p className="mt-1 text-[24px] font-semibold tabular-nums leading-none">{moneyAr(example.driverKeeps)}</p>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirmDialog({ row, onCancel, onConfirm }) {
  useEffect(() => {
    if (!row) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [row, onCancel]);

  if (!row) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
      <button
        type="button"
        className="absolute inset-0 bg-navy-900/50 backdrop-blur-[2px]"
        aria-label="Cancelar"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="tariff-delete-title"
        className="relative w-full max-w-[420px] rounded-[28px] bg-white p-6 shadow-2xl shadow-navy-900/20 ring-1 ring-slate-200"
      >
        <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-rose-500">Borrar franja</p>
        <h3 id="tariff-delete-title" className="mt-2 text-[22px] font-semibold tracking-tight text-navy-900">
          ¿La querés eliminar?
        </h3>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
          Se va a borrar {formatWindowHours(row)} · {formatWindowScheduleLabel(row)}.
          Después vale la tarifa por defecto o la siguiente franja que aplique.
        </p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="h-12 rounded-2xl px-5 text-[15px] font-semibold text-slate-600 transition hover:bg-slate-50"
          >
            Conservar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="h-12 rounded-2xl bg-rose-600 px-5 text-[15px] font-semibold text-white transition hover:bg-rose-700"
          >
            Sí, borrar
          </button>
        </div>
      </div>
    </div>
  );
}

const SCHEDULE_OPTIONS = [
  { id: 'always', title: 'Todos los días' },
  { id: 'weekdays', title: 'Días de la semana' },
  { id: 'date', title: 'Un día' },
];

function activeBadge(window) {
  if (window?.schedule_kind === 'date') return 'Día específico activo';
  if (window?.schedule_kind === 'weekdays') return 'Recurrente activa';
  return 'Franja activa';
}

function DayTimeline({ windows, now, accent, activeId, onSelect }) {
  const ctx = artTimeContext(now);
  return (
    <div>
      <div className="relative h-10 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200/80">
        {(windows || []).flatMap((row) => (
          windowSegmentsForCalendarDay(row, ctx).map((segment) => (
            <button
              key={`${row.id}-${segment.from}`}
              type="button"
              title={`${minutesToTimeInput(row.start_minute)}–${minutesToTimeInput(row.end_minute)} · ${formatWindowScheduleLabel(row)}`}
              onClick={() => onSelect?.(row)}
              className="absolute top-1.5 bottom-1.5 rounded-lg transition hover:brightness-95"
              style={{
                left: `${timelinePercent(segment.from)}%`,
                width: `${Math.max(1.2, timelinePercent(segment.to) - timelinePercent(segment.from))}%`,
                backgroundColor: row.id === activeId ? '#F59E0B' : accent,
                opacity: row.id === activeId ? 1 : 0.55,
              }}
            />
          ))
        ))}
        <span
          className="pointer-events-none absolute top-0 bottom-0 w-px bg-navy-900"
          style={{ left: `${timelinePercent(ctx.minute)}%` }}
        />
        <span
          className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-navy-900 ring-2 ring-white"
          style={{ left: `${timelinePercent(ctx.minute)}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] font-semibold tabular-nums text-slate-400">
        {HOUR_MARKS.map((hour) => (
          <span key={hour}>{String(hour).padStart(2, '0')}</span>
        ))}
      </div>
    </div>
  );
}

function ChannelCard({
  channel,
  defaults,
  live,
  windows,
  now,
  km,
  onUpdateSetting,
  onSaveWindow,
  onDeleteWindow,
  scrollRootRef,
}) {
  const meta = TARIFF_CHANNEL_META[channel];
  const formRef = useRef(null);
  const [draft, setDraft] = useState(() => emptyWindowDraft(defaults.perKm, defaults.base, defaults.commission));
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [formError, setFormError] = useState('');
  const channelWindows = sortTariffWindows(
    (windows || []).filter((row) => row.channel === channel),
  );
  const activeWindow = pickMatchingWindow(channelWindows, channel, now);
  const liveExample = exampleTripBreakdown(live, km);
  const defaultExample = exampleTripBreakdown({
    perKm: defaults.perKm,
    base: defaults.base,
    commissionPercent: defaults.commission,
  }, km);
  const activeHours = formatWindowHours(activeWindow);
  const fromWindow = live?.source === 'window' && activeWindow;

  useEffect(() => {
    if (!showForm) return undefined;
    const timer = window.setTimeout(() => {
      const form = formRef.current;
      const root = scrollRootRef?.current;
      if (!form) return;
      if (root) {
        const formRect = form.getBoundingClientRect();
        const rootRect = root.getBoundingClientRect();
        root.scrollTo({
          top: Math.max(0, root.scrollTop + (formRect.top - rootRect.top) - 16),
          behavior: 'smooth',
        });
        return;
      }
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [showForm, draft.id, scrollRootRef]);

  const openNew = () => {
    setDraft(emptyWindowDraft(defaults.perKm, defaults.base, defaults.commission));
    setShowForm(true);
    setPendingDelete(null);
    setFormError('');
  };

  const openEdit = (row) => {
    setDraft(draftFromWindow(row));
    setShowForm(true);
    setPendingDelete(null);
    setFormError('');
  };

  const toggleWeekday = (id) => {
    setDraft((prev) => {
      const next = new Set(prev.weekdays);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, weekdays: [...next].sort((a, b) => a - b) };
    });
  };

  const handleSave = async () => {
    if (draft.scheduleKind === 'weekdays' && !draft.weekdays.length) {
      setFormError('Elegí al menos un día de la semana.');
      return;
    }
    if (draft.scheduleKind === 'date' && !draft.specificDate) {
      setFormError('Elegí el día específico.');
      return;
    }
    setFormError('');
    setSaving(true);
    const ok = await onSaveWindow({
      id: draft.id || undefined,
      channel,
      startTime: draft.startTime,
      endTime: draft.endTime,
      per_km: draft.perKm,
      base: draft.base,
      commission_percent: draft.commission,
      enabled: true,
      schedule_kind: draft.scheduleKind,
      weekdays: draft.scheduleKind === 'weekdays' ? draft.weekdays : [],
      specific_date: draft.scheduleKind === 'date' ? draft.specificDate : null,
      label: draft.label,
    });
    setSaving(false);
    if (ok) setShowForm(false);
  };

  const handleConfirmDelete = () => {
    if (!pendingDelete?.id) return;
    if (draft.id === pendingDelete.id) setShowForm(false);
    onDeleteWindow?.(pendingDelete.id);
    setPendingDelete(null);
  };

  return (
    <section className="rounded-[28px] bg-white shadow-sm ring-1 ring-slate-200/70">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-5 sm:px-6">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: meta.accent }} />
            <h2 className="text-[20px] font-semibold tracking-tight text-navy-900">{meta.title}</h2>
            {fromWindow ? (
              <span className="rounded-full bg-amber-500/12 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                {activeBadge(activeWindow)}
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                Por defecto
              </span>
            )}
          </div>
          <p className="mt-1.5 text-[14px] leading-snug text-slate-500">{meta.hint}</p>
        </div>
        <p className="shrink-0 text-right">
          <span className="block text-[28px] font-semibold tabular-nums leading-none text-navy-900">
            {moneyAr(live.perKm)}
          </span>
          <span className="mt-1.5 block text-[13px] font-medium text-slate-500">/ km ahora</span>
        </p>
      </div>

      <div className="space-y-4 border-b border-slate-100 px-5 py-5 sm:px-6">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            {fromWindow ? `Vigente ahora · franja ${activeHours}` : 'Vigente ahora · tarifa por defecto'}
          </p>
          {fromWindow ? (
            <p className="mt-1 text-[14px] leading-relaxed text-slate-600">
              Estos números salen de la franja {activeHours}, no del default.
              {Number(live.base) !== Number(defaults.base)
                ? ` La base de ahora es ${moneyAr(live.base)}; el default (${moneyAr(defaults.base)}) se usa fuera de esta franja.`
                : ''}
            </p>
          ) : (
            <p className="mt-1 text-[14px] leading-relaxed text-slate-600">
              No hay franja activa a esta hora, así que vale lo de “por defecto”.
            </p>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-slate-50 px-4 py-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-500">Base</p>
            <p className="mt-2 text-[26px] font-semibold tabular-nums leading-none text-navy-900">{moneyAr(live.base)}</p>
          </div>
          <div className="rounded-2xl bg-slate-50 px-4 py-4">
            <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-slate-500">Comisión</p>
            <p className="mt-2 text-[26px] font-semibold tabular-nums leading-none text-navy-900">{Math.round(live.commissionPercent)}%</p>
          </div>
        </div>
        <QuoteBreakdown km={km} example={liveExample} />
      </div>

      <div className="px-5 py-5 sm:px-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
          Por defecto · fuera de franjas
        </p>
        <p className="mt-1 text-[14px] leading-relaxed text-slate-600">
          Se usa solo cuando no hay una franja activa. No pisa la base de una franja ya guardada.
        </p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Field
            label="$ / km"
            prefix="$"
            value={defaults.perKm}
            onChange={(value) => onUpdateSetting(defaults.keys.perKm, value)}
          />
          <Field
            label="Base"
            prefix="$"
            value={defaults.base}
            onChange={(value) => onUpdateSetting(defaults.keys.base, value)}
          />
          <Field
            label="Comisión"
            value={defaults.commission}
            suffix="%"
            onChange={(value) => onUpdateSetting(defaults.keys.commission, value)}
          />
        </div>
        <p className="mt-3 text-[14px] text-slate-500">
          Con el default, {km} km sale {moneyAr(defaultExample.price)} · comisión {moneyAr(defaultExample.commission)} · chofer {moneyAr(defaultExample.driverKeeps)}.
        </p>
      </div>

      <div className="border-t border-slate-100 px-5 py-5 sm:px-6">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Franjas horarias</p>
            <p className="mt-1 max-w-xl text-[14px] leading-relaxed text-slate-500">
              Cada franja tiene su propio $/km, base y comisión. Prioridad: un día específico, después días recurrentes, después todos los días.
            </p>
          </div>
          <button
            type="button"
            onClick={openNew}
            className="h-11 shrink-0 rounded-2xl bg-navy-900 px-4 text-[14px] font-semibold text-white transition hover:bg-navy-900/90"
          >
            + Agregar
          </button>
        </div>
        <DayTimeline
          windows={channelWindows}
          now={now}
          accent={meta.accent}
          activeId={activeWindow?.id}
          onSelect={openEdit}
        />
        {channelWindows.length === 0 && !showForm ? (
          <p className="mt-4 text-[14px] leading-relaxed text-slate-500">
            Sin franjas: vale la tarifa por defecto las 24 horas, todos los días.
          </p>
        ) : (
          <div className="mt-4 space-y-2.5">
            {channelWindows.map((row) => {
              const isActive = activeWindow?.id === row.id;
              const isEditing = showForm && draft.id === row.id;
              return (
                <div
                  key={row.id}
                  className={`flex flex-col gap-3 rounded-2xl px-4 py-3.5 sm:flex-row sm:items-center ${
                    isActive ? 'bg-amber-500/10 ring-1 ring-amber-500/20' : 'bg-slate-50'
                  } ${isEditing ? 'ring-2 ring-navy-900/15' : ''}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-semibold tabular-nums text-navy-900">
                      {formatWindowHours(row)}
                      {isActive ? <span className="ml-2 text-[12px] font-bold text-amber-700">Ahora</span> : null}
                    </p>
                    <p className="mt-1 text-[14px] leading-snug text-slate-600">
                      {formatWindowScheduleLabel(row)} · {moneyAr(row.per_km)}/km · base {moneyAr(row.base)} · {Math.round(Number(row.commission_percent) || 0)}%
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      type="button"
                      onClick={() => openEdit(row)}
                      className="inline-flex h-12 min-w-[108px] items-center justify-center rounded-2xl bg-white px-5 text-[15px] font-semibold text-navy-900 ring-1 ring-slate-200 transition hover:bg-slate-50"
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete(row)}
                      className="inline-flex h-12 min-w-[108px] items-center justify-center rounded-2xl bg-rose-50 px-5 text-[15px] font-semibold text-rose-600 ring-1 ring-rose-100 transition hover:bg-rose-100"
                    >
                      Borrar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {showForm ? (
          <div
            ref={formRef}
            id="tariff-window-form"
            className="mt-4 space-y-4 rounded-[24px] bg-slate-50 p-4 ring-1 ring-slate-200 sm:p-5"
          >
            <div>
              <p className="text-[16px] font-semibold text-navy-900">
                {draft.id ? 'Editar franja' : 'Nueva franja'}
              </p>
              <p className="mt-1 text-[13px] text-slate-500">
                Si “desde” es mayor que “hasta”, cruza medianoche y sigue valiendo al día siguiente.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SCHEDULE_OPTIONS.map((option) => {
                const selected = draft.scheduleKind === option.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, scheduleKind: option.id }))}
                    className={`h-10 rounded-full px-4 text-[13px] font-semibold transition ${
                      selected ? 'bg-navy-900 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:text-navy-900'
                    }`}
                  >
                    {option.title}
                  </button>
                );
              })}
            </div>

            {draft.scheduleKind === 'weekdays' ? (
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_OPTIONS.map((day) => {
                  const selected = draft.weekdays.includes(day.id);
                  return (
                    <button
                      key={day.id}
                      type="button"
                      title={day.long}
                      aria-pressed={selected}
                      onClick={() => toggleWeekday(day.id)}
                      className={`h-10 min-w-[44px] rounded-xl px-2.5 text-[13px] font-semibold transition ${
                        selected ? 'bg-navy-900 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200 hover:text-navy-900'
                      }`}
                    >
                      {day.short}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {draft.scheduleKind === 'date' ? (
              <div className="flex flex-col gap-3 sm:flex-row">
                <label className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Día</span>
                  <input
                    type="date"
                    value={draft.specificDate}
                    onChange={(event) => setDraft((prev) => ({ ...prev, specificDate: event.target.value }))}
                    className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-[16px] font-semibold text-navy-900"
                  />
                </label>
                <label className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Nombre (opcional)</span>
                  <input
                    type="text"
                    maxLength={80}
                    placeholder="Navidad, feriado…"
                    value={draft.label}
                    onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
                    className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-[16px] font-semibold text-navy-900 placeholder:font-medium placeholder:text-slate-400"
                  />
                </label>
              </div>
            ) : (
              <label className="flex min-w-0 flex-col gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Nombre (opcional)</span>
                <input
                  type="text"
                  maxLength={80}
                  placeholder="Noche, fin de semana…"
                  value={draft.label}
                  onChange={(event) => setDraft((prev) => ({ ...prev, label: event.target.value }))}
                  className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-[16px] font-semibold text-navy-900 placeholder:font-medium placeholder:text-slate-400"
                />
              </label>
            )}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Desde</span>
                <input
                  type="time"
                  value={draft.startTime}
                  onChange={(event) => setDraft((prev) => ({ ...prev, startTime: event.target.value }))}
                  className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-[16px] font-semibold text-navy-900"
                />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Hasta</span>
                <input
                  type="time"
                  value={draft.endTime}
                  onChange={(event) => setDraft((prev) => ({ ...prev, endTime: event.target.value }))}
                  className="h-14 rounded-2xl border border-slate-200 bg-white px-4 text-[16px] font-semibold text-navy-900"
                />
              </label>
              <button
                type="button"
                onClick={() => setDraft((prev) => ({ ...prev, startTime: '00:00', endTime: '23:59' }))}
                className="h-14 shrink-0 rounded-2xl bg-white px-4 text-[13px] font-semibold text-slate-600 ring-1 ring-slate-200 hover:text-navy-900"
              >
                Todo el día
              </button>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Field label="$ / km" prefix="$" value={draft.perKm} onChange={(value) => setDraft((prev) => ({ ...prev, perKm: value }))} />
              <Field label="Base" prefix="$" value={draft.base} onChange={(value) => setDraft((prev) => ({ ...prev, base: value }))} />
              <Field label="Comisión" suffix="%" value={draft.commission} onChange={(value) => setDraft((prev) => ({ ...prev, commission: value }))} />
            </div>
            {formError ? <p className="text-[14px] font-medium text-rose-600">{formError}</p> : null}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="h-12 rounded-2xl px-5 text-[14px] font-semibold text-slate-500 hover:bg-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="h-12 rounded-2xl bg-navy-900 px-5 text-[14px] font-semibold text-white disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar franja'}
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <DeleteConfirmDialog
        row={pendingDelete}
        onCancel={() => setPendingDelete(null)}
        onConfirm={handleConfirmDelete}
      />
    </section>
  );
}

export default function TariffsPanel({
  onBack,
  tariffPerKm,
  tariffBase,
  commissionPercent,
  platformDefaultPerKm,
  platformDefaultBase,
  platformDefaultCommission,
  passengerAppTariffPerKm,
  passengerAppTariffBase,
  passengerAppCommissionPercent,
  passengerWebTariffPerKm,
  passengerWebTariffBase,
  passengerWebCommissionPercent,
  passengerWaitFeePerMinute = 0,
  tariffWindows = [],
  onUpdateSetting,
  onSaveWindow,
  onDeleteWindow,
}) {
  const [section, setSection] = useState('general');
  const [channel, setChannel] = useState('platform');
  const [km, setKm] = useState(5);
  const [now, setNow] = useState(() => new Date());
  const scrollRootRef = useRef(null);

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);

  const settingsMap = useMemo(() => settingsMapFromTariffDefaults({
    platformDefaultPerKm,
    platformDefaultBase,
    platformDefaultCommission,
    passengerAppTariffPerKm,
    passengerAppTariffBase,
    passengerAppCommissionPercent,
    passengerWebTariffPerKm,
    passengerWebTariffBase,
    passengerWebCommissionPercent,
  }), [
    platformDefaultPerKm,
    platformDefaultBase,
    platformDefaultCommission,
    passengerAppTariffPerKm,
    passengerAppTariffBase,
    passengerAppCommissionPercent,
    passengerWebTariffPerKm,
    passengerWebTariffBase,
    passengerWebCommissionPercent,
  ]);

  const liveByChannel = useMemo(() => {
    const map = {};
    CHANNEL_ORDER.forEach((id) => {
      map[id] = resolveChannelTariff({
        settingsMap,
        windows: tariffWindows,
        channel: id,
        at: now,
      });
    });
    return map;
  }, [settingsMap, tariffWindows, now]);

  const defaultsByChannel = {
    platform: {
      perKm: platformDefaultPerKm,
      base: platformDefaultBase,
      commission: platformDefaultCommission,
      keys: { perKm: 'platform_tariff_per_km', base: 'platform_tariff_base', commission: 'platform_commission_percent' },
    },
    passenger_app: {
      perKm: passengerAppTariffPerKm,
      base: passengerAppTariffBase,
      commission: passengerAppCommissionPercent,
      keys: { perKm: 'passenger_app_tariff_per_km', base: 'passenger_app_tariff_base', commission: 'passenger_app_commission_percent' },
    },
    passenger_web: {
      perKm: passengerWebTariffPerKm,
      base: passengerWebTariffBase,
      commission: passengerWebCommissionPercent,
      keys: { perKm: 'passenger_web_tariff_per_km', base: 'passenger_web_tariff_base', commission: 'passenger_web_commission_percent' },
    },
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[#F3F5F8]">
      <div ref={scrollRootRef} className="tariffs-scroll min-h-0 flex-1">
        <div className="px-3 pt-2 sm:px-5">
          <header className="mx-auto max-w-6xl rounded-2xl bg-navy-900 px-3 py-2 text-white shadow-md shadow-navy-900/10 sm:px-4">
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
              <div className="flex min-w-0 items-center gap-2.5">
                <button
                  type="button"
                  onClick={onBack}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
                  aria-label="Volver al mapa"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/45">Configuración</p>
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <h1 className="text-[17px] font-semibold tracking-tight">Tarifas</h1>
                    <p className="truncate text-[12px] text-white/55">
                      Ahora {artClockLabel(now)} · {moneyAr(tariffPerKm)}/km · base {moneyAr(tariffBase)} · comisión {Math.round(commissionPercent)}%
                    </p>
                  </div>
                </div>
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-1 lg:max-w-sm lg:items-stretch">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="mr-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Simulador</p>
                  {KM_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setKm(preset)}
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                        km === preset ? 'bg-white text-navy-900' : 'bg-white/10 text-white/70 hover:bg-white/20'
                      }`}
                    >
                      {preset} km
                    </button>
                  ))}
                </div>
                <label className="block">
                  <span className="sr-only">Kilómetros de ejemplo</span>
                  <input
                    type="range"
                    min="1"
                    max="30"
                    value={km}
                    onChange={(event) => setKm(Number(event.target.value) || 5)}
                    className="w-full accent-amber-400"
                  />
                </label>
              </div>
            </div>
          </header>

          <div className="mx-auto mt-2 max-w-6xl">
            <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-200/80 p-1">
              <button
                type="button"
                onClick={() => setSection('general')}
                className={`h-9 rounded-lg px-3 text-[13px] font-semibold transition ${
                  section === 'general'
                    ? 'bg-navy-900 text-white shadow-sm shadow-navy-900/20'
                    : 'bg-white text-slate-500 hover:text-navy-900'
                }`}
              >
                Tarifas general
              </button>
              <button
                type="button"
                onClick={() => setSection('zones')}
                className={`h-9 rounded-lg px-3 text-[13px] font-semibold transition ${
                  section === 'zones'
                    ? 'bg-navy-900 text-white shadow-sm shadow-navy-900/20'
                    : 'bg-white text-slate-500 hover:text-navy-900'
                }`}
              >
                Tarifas por zonas
              </button>
            </div>
          </div>
        </div>

        {section === 'zones' ? (
          <div className="px-3 pb-10 pt-2 sm:px-5">
            <div className="h-[calc(100dvh-2.5rem)] min-h-[760px] overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70">
              <ZoneManagement
                mode="hot"
                embedded
                liveTariffs={liveByChannel}
                exampleKm={km}
              />
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-6xl space-y-5 px-3 pb-16 pt-2 sm:px-5">
            <div className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-slate-200/70 sm:p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Espera del pasajero
                  </p>
                  <h3 className="mt-1.5 text-[20px] font-semibold tracking-tight text-navy-900">
                    Precio por minuto de espera
                  </h3>
                  <p className="mt-1.5 max-w-xl text-[14px] leading-relaxed text-slate-600">
                    Cuando el chofer marca que llegó al origen y el pasajero todavía no subió,
                    cada minuto completo suma este monto al total. Los primeros 59 segundos no cobran.
                    Si el viaje se cancela con espera, el saldo se cobra en el próximo viaje.
                  </p>
                </div>
                <div className="w-full sm:max-w-[220px]">
                  <Field
                    label="$ / minuto de espera"
                    prefix="$"
                    value={passengerWaitFeePerMinute}
                    onChange={(value) => onUpdateSetting('passenger_wait_fee_per_minute', value)}
                  />
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {CHANNEL_ORDER.map((id) => {
                const meta = TARIFF_CHANNEL_META[id];
                const live = liveByChannel[id];
                const selected = channel === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setChannel(id)}
                    className={`rounded-[24px] px-4 py-4 text-left transition ${
                      selected
                        ? 'bg-navy-900 text-white shadow-xl shadow-navy-900/25 ring-2 ring-amber-400'
                        : 'bg-white text-navy-900 shadow-sm ring-1 ring-slate-200/70 hover:ring-navy-900/20'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                        selected ? 'text-white/55' : 'text-slate-400'
                      }`}>{meta.title}</p>
                      {selected ? (
                        <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-navy-900">
                          Seleccionada
                        </span>
                      ) : null}
                    </div>
                    <p className={`mt-2 text-[22px] font-semibold tabular-nums leading-none ${
                      selected ? 'text-white' : 'text-navy-900'
                    }`}>
                      {moneyAr(live.perKm)}<span className={`text-[13px] font-medium ${selected ? 'text-white/55' : 'text-slate-400'}`}>/km</span>
                    </p>
                    <p className={`mt-2 text-[11px] ${selected ? 'text-white/60' : 'text-slate-400'}`}>
                      {windowSourceLabel(live)}
                    </p>
                  </button>
                );
              })}
            </div>

            <ChannelCard
              key={channel}
              channel={channel}
              defaults={defaultsByChannel[channel]}
              live={liveByChannel[channel]}
              windows={tariffWindows}
              now={now}
              km={km}
              scrollRootRef={scrollRootRef}
              onUpdateSetting={onUpdateSetting}
              onSaveWindow={onSaveWindow}
              onDeleteWindow={onDeleteWindow}
            />
          </div>
        )}
      </div>
    </div>
  );
}
