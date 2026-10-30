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
      <span className="text-center text-[12px] font-medium text-slate-500">{label}</span>
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
        <h3 id="tariff-delete-title" className="mt-1 text-center text-[18px] font-semibold tracking-tight text-navy-900">
          Borrar {formatWindowHours(row)}
        </h3>
        <p className="mt-1 text-center text-[14px] text-slate-500">
          {formatWindowScheduleLabel(row)}
        </p>
        <div className="mt-6 flex justify-center gap-2">
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
    <section className="rounded-3xl bg-white shadow-sm ring-1 ring-slate-200/80">
      <div className="flex items-center justify-center gap-2 px-5 pt-5">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.accent }} />
        <h2 className="text-[17px] font-semibold tracking-tight text-navy-900">{meta.title}</h2>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          fromWindow ? 'bg-amber-50 text-amber-700' : 'bg-slate-100 text-slate-500'
        }`}>
          {fromWindow ? activeHours : 'Por defecto'}
        </span>
      </div>
      <p className="mt-2 text-center text-[28px] font-semibold tabular-nums leading-none tracking-tight text-navy-900">
        {moneyAr(live.perKm)}
        <span className="text-[14px] font-medium text-slate-400">/km</span>
      </p>
      <p className="mt-2 text-center text-[13px] text-slate-500">
        Base {moneyAr(live.base)} · {Math.round(live.commissionPercent)}%
      </p>
      <p className="mt-1 text-center text-[15px] font-semibold tabular-nums text-navy-900">
        {km} km · {moneyAr(liveExample.price)}
      </p>

      <div className="px-5 py-5 sm:px-6">
        <div className="flex flex-col gap-3 sm:flex-row">
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
            suffix="%"
            value={defaults.commission}
            onChange={(value) => onUpdateSetting(defaults.keys.commission, value)}
          />
        </div>
      </div>

      <div className="border-t border-slate-100 px-5 py-5 sm:px-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="text-[15px] font-semibold text-navy-900">Franjas</p>
          <button
            type="button"
            onClick={openNew}
            className="h-10 shrink-0 rounded-xl bg-navy-900 px-4 text-[13px] font-semibold text-white transition hover:bg-navy-900/90"
          >
            Agregar
          </button>
        </div>
        <DayTimeline
          windows={channelWindows}
          now={now}
          accent={meta.accent}
          activeId={activeWindow?.id}
          onSelect={openEdit}
        />
        {channelWindows.length === 0 && !showForm ? null : (
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
              <p className="text-center text-[16px] font-semibold text-navy-900">
                {draft.id ? 'Editar franja' : 'Nueva franja'}
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-1.5">
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
              <div className="flex flex-wrap justify-center gap-1.5">
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
  platformWaitFicha = 0,
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
        <div className="mx-auto w-full max-w-6xl px-4 pt-6 sm:px-8">
          <header className="relative flex items-center justify-center">
            <button
              type="button"
              onClick={onBack}
              className="absolute left-0 flex h-9 w-9 items-center justify-center rounded-full text-slate-400 transition hover:bg-white hover:text-navy-900"
              aria-label="Volver al mapa"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="text-center">
              <h1 className="text-[40px] font-semibold tracking-tight text-navy-900">Tarifas</h1>
              <p className="mt-1 text-[22px] font-semibold tabular-nums text-slate-600">
                {artClockLabel(now)} · {moneyAr(tariffPerKm)}/km
              </p>
            </div>
          </header>

          <div className="mx-auto mt-6 flex max-w-md justify-center gap-1 rounded-full bg-white p-1 ring-1 ring-slate-200/80">
            <button
              type="button"
              onClick={() => setSection('general')}
              className={`h-9 flex-1 rounded-full px-3 text-[13px] font-semibold transition ${
                section === 'general' ? 'bg-navy-900 text-white' : 'text-slate-500 hover:text-navy-900'
              }`}
            >
              General
            </button>
            <button
              type="button"
              onClick={() => setSection('zones')}
              className={`h-9 flex-1 rounded-full px-3 text-[13px] font-semibold transition ${
                section === 'zones' ? 'bg-navy-900 text-white' : 'text-slate-500 hover:text-navy-900'
              }`}
            >
              Zonas
            </button>
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
          <div className="mx-auto max-w-6xl space-y-5 px-4 pb-16 pt-6 sm:px-8">
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-3xl bg-white px-4 py-4 text-center shadow-sm ring-1 ring-slate-200/80">
                <p className="text-[13px] font-semibold text-slate-500">Espera</p>
                <div className="mt-2">
                  <Field
                    label="$ / min"
                    prefix="$"
                    value={passengerWaitFeePerMinute}
                    onChange={(value) => onUpdateSetting('passenger_wait_fee_per_minute', value)}
                  />
                </div>
              </div>
              <div className="rounded-3xl bg-white px-4 py-4 text-center shadow-sm ring-1 ring-slate-200/80">
                <p className="text-[13px] font-semibold text-slate-500">Ficha en reposo</p>
                <div className="mt-2">
                  <Field
                    label="$ / min"
                    prefix="$"
                    value={platformWaitFicha}
                    onChange={(value) => onUpdateSetting('platform_tariff_wait_ficha', value)}
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-center gap-1.5">
              {KM_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setKm(preset)}
                  className={`h-8 rounded-full px-3 text-[12px] font-semibold tabular-nums ${
                    km === preset ? 'bg-navy-900 text-white' : 'bg-white text-slate-500 ring-1 ring-slate-200'
                  }`}
                >
                  {preset} km
                </button>
              ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
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
                    className={`rounded-2xl px-2 py-3 text-center transition ${
                      selected
                        ? 'bg-navy-900 text-white'
                        : 'bg-white text-navy-900 ring-1 ring-slate-200/80 hover:ring-slate-300'
                    }`}
                  >
                    <p className={`text-[12px] font-semibold ${selected ? 'text-white/70' : 'text-slate-400'}`}>
                      {meta.title}
                    </p>
                    <p className="mt-1 text-[16px] font-semibold tabular-nums leading-none">
                      {moneyAr(live.perKm)}
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
