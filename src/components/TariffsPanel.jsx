'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  artMinutesFromDate,
  minutesToTimeInput,
  pickMatchingWindow,
  resolveChannelTariff,
} from '../lib/resolveTariff';
import {
  TARIFF_CHANNEL_META,
  digitsOnly,
  draftFromWindow,
  emptyWindowDraft,
  exampleTripBreakdown,
  moneyAr,
  settingsMapFromTariffDefaults,
  timelinePercent,
  windowTimelineSegments,
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
    <label className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</span>
      <span className="relative block">
        {prefix ? (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] font-semibold text-slate-400">
            {prefix}
          </span>
        ) : null}
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          value={String(value ?? '')}
          onChange={(event) => onChange(digitsOnly(event.target.value))}
          className={`h-12 w-full rounded-2xl border border-slate-200 bg-slate-50 text-[18px] font-semibold tabular-nums text-navy-900 outline-none transition focus:border-navy-900/30 focus:bg-white focus:ring-2 focus:ring-navy-900/10 ${
            prefix ? 'pl-7 pr-3' : 'px-3'
          } ${suffix ? 'pr-10' : ''}`}
        />
        {suffix ? (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-slate-400">
            {suffix}
          </span>
        ) : null}
      </span>
    </label>
  );
}

function DayTimeline({ windows, channel, nowMinute, accent, activeId, onSelect }) {
  const rows = (windows || []).filter((row) => row.channel === channel);
  return (
    <div>
      <div className="relative h-10 overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200/80">
        {rows.flatMap((row) => (
          windowTimelineSegments(row).map((segment) => (
            <button
              key={`${row.id}-${segment.from}`}
              type="button"
              title={`${minutesToTimeInput(row.start_minute)}–${minutesToTimeInput(row.end_minute)}`}
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
          style={{ left: `${timelinePercent(nowMinute)}%` }}
        />
        <span
          className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-navy-900 ring-2 ring-white"
          style={{ left: `${timelinePercent(nowMinute)}%` }}
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
  nowMinute,
  km,
  onUpdateSetting,
  onSaveWindow,
  onDeleteWindow,
}) {
  const meta = TARIFF_CHANNEL_META[channel];
  const [draft, setDraft] = useState(() => emptyWindowDraft(defaults.perKm, defaults.base, defaults.commission));
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState(null);
  const channelWindows = (windows || [])
    .filter((row) => row.channel === channel)
    .slice()
    .sort((a, b) => Number(a.start_minute) - Number(b.start_minute));
  const activeWindow = pickMatchingWindow(channelWindows, channel, nowMinute);
  const liveExample = exampleTripBreakdown(live, km);
  const defaultExample = exampleTripBreakdown({
    perKm: defaults.perKm,
    base: defaults.base,
    commissionPercent: defaults.commission,
  }, km);

  const openNew = () => {
    setDraft(emptyWindowDraft(defaults.perKm, defaults.base, defaults.commission));
    setShowForm(true);
    setConfirmId(null);
  };

  const openEdit = (row) => {
    setDraft(draftFromWindow(row));
    setShowForm(true);
    setConfirmId(null);
  };

  const handleSave = async () => {
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
    });
    setSaving(false);
    if (ok) setShowForm(false);
  };

  return (
    <section className="overflow-hidden rounded-[28px] bg-white shadow-sm ring-1 ring-slate-200/70">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: meta.accent }} />
            <h2 className="text-[16px] font-semibold tracking-tight text-navy-900">{meta.title}</h2>
            {activeWindow ? (
              <span className="rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                Franja activa
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                Por defecto
              </span>
            )}
          </div>
          <p className="mt-1 text-[12px] leading-snug text-slate-500">{meta.hint}</p>
        </div>
        <p className="shrink-0 text-right">
          <span className="block text-[22px] font-semibold tabular-nums leading-none text-navy-900">
            {moneyAr(live.perKm)}
          </span>
          <span className="mt-1 block text-[11px] text-slate-400">/ km ahora</span>
        </p>
      </div>

      <div className="grid gap-3 border-b border-slate-100 px-5 py-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-slate-50 px-3.5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Base</p>
          <p className="mt-1 text-[18px] font-semibold tabular-nums text-navy-900">{moneyAr(live.base)}</p>
        </div>
        <div className="rounded-2xl bg-slate-50 px-3.5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Comisión</p>
          <p className="mt-1 text-[18px] font-semibold tabular-nums text-navy-900">{Math.round(live.commissionPercent)}%</p>
        </div>
        <div className="rounded-2xl bg-slate-50 px-3.5 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Ejemplo {km} km</p>
          <p className="mt-1 text-[18px] font-semibold tabular-nums text-navy-900">{moneyAr(liveExample.price)}</p>
          <p className="mt-0.5 text-[11px] text-slate-400">
            {moneyAr(liveExample.commission)} comisión · chofer {moneyAr(liveExample.driverKeeps)}
          </p>
        </div>
      </div>

      <div className="px-5 py-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Por defecto · fuera de franjas
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
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
        <p className="mt-2 text-[11px] text-slate-400">
          Con estos valores, {km} km sale {moneyAr(defaultExample.price)} y la comisión es {moneyAr(defaultExample.commission)}.
        </p>
      </div>

      <div className="border-t border-slate-100 px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Franjas del día</p>
          <button
            type="button"
            onClick={openNew}
            className="rounded-full bg-navy-900 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-navy-900/90"
          >
            + Agregar
          </button>
        </div>
        <DayTimeline
          windows={channelWindows}
          channel={channel}
          nowMinute={nowMinute}
          accent={meta.accent}
          activeId={activeWindow?.id}
          onSelect={openEdit}
        />
        {channelWindows.length === 0 && !showForm ? (
          <p className="mt-3 text-[12px] leading-relaxed text-slate-400">
            Sin franjas: vale la tarifa por defecto las 24 horas.
          </p>
        ) : (
          <div className="mt-3 space-y-1.5">
            {channelWindows.map((row) => (
              <div
                key={row.id}
                className={`flex items-center gap-3 rounded-2xl px-3 py-2.5 ${
                  activeWindow?.id === row.id ? 'bg-amber-500/10 ring-1 ring-amber-500/20' : 'bg-slate-50'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-semibold tabular-nums text-navy-900">
                    {minutesToTimeInput(row.start_minute)}–{minutesToTimeInput(row.end_minute)}
                  </p>
                  <p className="truncate text-[11px] text-slate-500">
                    {moneyAr(row.per_km)}/km · base {moneyAr(row.base)} · {Math.round(Number(row.commission_percent) || 0)}%
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openEdit(row)}
                  className="text-[11px] font-semibold text-slate-500 hover:text-navy-900"
                >
                  Editar
                </button>
                {confirmId === row.id ? (
                  <button
                    type="button"
                    onClick={() => {
                      onDeleteWindow?.(row.id);
                      setConfirmId(null);
                    }}
                    className="text-[11px] font-semibold text-rose-600"
                  >
                    Confirmar
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmId(row.id)}
                    className="text-[11px] font-semibold text-rose-500 hover:text-rose-700"
                  >
                    Borrar
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {showForm ? (
          <div className="mt-3 space-y-3 rounded-2xl bg-slate-50 p-3 ring-1 ring-slate-200">
            <div className="flex gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Desde</span>
                <input
                  type="time"
                  value={draft.startTime}
                  onChange={(event) => setDraft((prev) => ({ ...prev, startTime: event.target.value }))}
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-[14px] font-semibold text-navy-900"
                />
              </label>
              <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">Hasta</span>
                <input
                  type="time"
                  value={draft.endTime}
                  onChange={(event) => setDraft((prev) => ({ ...prev, endTime: event.target.value }))}
                  className="h-11 rounded-2xl border border-slate-200 bg-white px-3 text-[14px] font-semibold text-navy-900"
                />
              </label>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Field label="$ / km" prefix="$" value={draft.perKm} onChange={(value) => setDraft((prev) => ({ ...prev, perKm: value }))} />
              <Field label="Base" prefix="$" value={draft.base} onChange={(value) => setDraft((prev) => ({ ...prev, base: value }))} />
              <Field label="Comisión" suffix="%" value={draft.commission} onChange={(value) => setDraft((prev) => ({ ...prev, commission: value }))} />
            </div>
            <p className="text-[11px] text-slate-400">Si “desde” es mayor que “hasta”, la franja cruza medianoche.</p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-full px-3 py-1.5 text-[12px] font-semibold text-slate-500 hover:bg-white"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={handleSave}
                className="rounded-full bg-navy-900 px-3.5 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50"
              >
                {saving ? 'Guardando…' : 'Guardar franja'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
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
  tariffWindows = [],
  onUpdateSetting,
  onSaveWindow,
  onDeleteWindow,
}) {
  const [channel, setChannel] = useState('platform');
  const [km, setKm] = useState(5);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);

  const nowMinute = artMinutesFromDate(now);
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
    <div className="h-full min-h-0 overflow-x-hidden overflow-y-auto bg-[#F3F5F8]">
      <div className="mx-auto max-w-6xl space-y-5 px-3 py-4 pb-16 sm:px-5 sm:py-6">
        <header className="relative overflow-hidden rounded-[28px] bg-navy-900 px-5 py-5 text-white shadow-lg shadow-navy-900/10 sm:px-6">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-sky-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-amber-300/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={onBack}
                className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
                aria-label="Volver al mapa"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Configuración</p>
                <h1 className="mt-1 text-[30px] font-semibold tracking-tight">Tarifas</h1>
                <p className="mt-1 text-[13px] text-white/55">
                  Ahora {artClockLabel(now)} · {moneyAr(tariffPerKm)}/km · base {moneyAr(tariffBase)} · comisión {Math.round(commissionPercent)}%
                </p>
              </div>
            </div>
            <div className="min-w-[220px] rounded-2xl bg-white/10 px-4 py-3 ring-1 ring-white/10">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/40">Simulador</p>
              <div className="mt-2 flex items-center gap-2">
                {KM_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setKm(preset)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums ${
                      km === preset ? 'bg-white text-navy-900' : 'bg-white/10 text-white/70 hover:bg-white/20'
                    }`}
                  >
                    {preset} km
                  </button>
                ))}
              </div>
              <label className="mt-2 block">
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

        <div className="grid gap-3 sm:grid-cols-3">
          {CHANNEL_ORDER.map((id) => {
            const meta = TARIFF_CHANNEL_META[id];
            const live = liveByChannel[id];
            const selected = channel === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setChannel(id)}
                className={`rounded-[24px] px-4 py-4 text-left shadow-sm ring-1 transition ${
                  selected
                    ? 'bg-white ring-navy-900/15 shadow-navy-900/5'
                    : 'bg-white/70 ring-slate-200/70 hover:bg-white'
                }`}
              >
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">{meta.title}</p>
                <p className="mt-2 text-[22px] font-semibold tabular-nums leading-none text-navy-900">
                  {moneyAr(live.perKm)}<span className="text-[13px] font-medium text-slate-400">/km</span>
                </p>
                <p className="mt-2 text-[11px] text-slate-400">
                  {live.source === 'window' ? 'Franja horaria vigente' : 'Tarifa por defecto'}
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
          nowMinute={nowMinute}
          km={km}
          onUpdateSetting={onUpdateSetting}
          onSaveWindow={onSaveWindow}
          onDeleteWindow={onDeleteWindow}
        />
      </div>
    </div>
  );
}
