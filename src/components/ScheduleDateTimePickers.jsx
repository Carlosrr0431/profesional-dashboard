'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  buildCalendarGrid,
  parseAnchorString,
  toAnchorString,
} from '../lib/commissionPaymentPeriods';

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const HOURS_24 = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

const triggerStyle = {
  width: '100%',
  padding: '9px 12px',
  background: '#FFFFFF',
  border: '1.5px solid #E2E8F0',
  borderRadius: 10,
  color: '#0F172A',
  fontSize: 13,
  fontFamily: 'inherit',
  fontWeight: 600,
  outline: 'none',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: 8,
  textAlign: 'left',
};

function cellToAnchor(cell) {
  return `${cell.year}-${String(cell.month).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
}

function formatDateLabel(isoDate) {
  const parts = parseAnchorString(isoDate);
  const label = new Intl.DateTimeFormat('es-AR', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'America/Argentina/Salta',
  }).format(new Date(`${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}T12:00:00-03:00`));
  return label.replace(/\.$/, '');
}

function parseTimeParts(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
  if (!match) return { hour: '12', minute: '00' };
  return {
    hour: String(Math.min(23, Number(match[1]))).padStart(2, '0'),
    minute: String(Math.min(59, Number(match[2]))).padStart(2, '0'),
  };
}

function scrollChildIntoView(el, scroller) {
  if (!el) return;
  const parent = scroller || el.parentElement;
  if (!parent) return;
  const parentRect = parent.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  if (parentRect.height < 8) return;
  parent.scrollTop += (elRect.top + elRect.height / 2) - (parentRect.top + parent.clientHeight / 2);
}

function currentArTimeParts() {
  const formatted = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Argentina/Salta',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
  const [hour, minute] = formatted.split(':');
  return {
    hour: String(hour || '00').padStart(2, '0'),
    minute: String(minute || '00').padStart(2, '0'),
  };
}

function useAnchoredPopover(open, onClose) {
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const [coords, setCoords] = useState(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    if (!open) {
      setCoords(null);
      return undefined;
    }
    const update = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const width = Math.max(rect.width, 228);
      const left = Math.min(Math.max(8, rect.left), window.innerWidth - width - 8);
      const estimatedHeight = 280;
      const below = rect.bottom + 6;
      const top = below + estimatedHeight > window.innerHeight - 8
        ? Math.max(8, rect.top - estimatedHeight - 6)
        : below;
      setCoords({ top, left, width });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (event) => {
      const t = event.target;
      if (buttonRef.current?.contains(t)) return;
      if (panelRef.current?.contains(t)) return;
      onCloseRef.current();
    };
    const onKey = (event) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return { buttonRef, panelRef, coords };
}

export function ScheduleDatePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const { buttonRef, panelRef, coords } = useAnchoredPopover(open, () => setOpen(false));
  const parts = parseAnchorString(value);
  const [viewYear, setViewYear] = useState(parts.year);
  const [viewMonth, setViewMonth] = useState(parts.month);
  const today = toAnchorString(new Date());

  useEffect(() => {
    const next = parseAnchorString(value);
    setViewYear(next.year);
    setViewMonth(next.month);
  }, [value]);

  const calendarCells = useMemo(
    () => buildCalendarGrid(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  const shiftViewMonth = (delta) => {
    let nextMonth = viewMonth + delta;
    let nextYear = viewYear;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    setViewYear(nextYear);
    setViewMonth(nextMonth);
  };

  const viewMonthLabel = new Intl.DateTimeFormat('es-AR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Argentina/Salta',
  }).format(new Date(`${viewYear}-${String(viewMonth).padStart(2, '0')}-01T12:00:00-03:00`));

  const panel = open && coords && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Elegir día"
        className="fixed z-[10050] rounded-2xl border border-violet-200 bg-white p-3 shadow-2xl shadow-violet-900/15"
        style={{ top: coords.top, left: coords.left, width: coords.width }}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => shiftViewMonth(-1)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-violet-500 hover:bg-violet-50"
            aria-label="Mes anterior"
          >
            ‹
          </button>
          <span className="text-[12px] font-semibold capitalize text-violet-900">{viewMonthLabel}</span>
          <button
            type="button"
            onClick={() => shiftViewMonth(1)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-violet-500 hover:bg-violet-50"
            aria-label="Mes siguiente"
          >
            ›
          </button>
        </div>
        <div className="mb-1 grid grid-cols-7 gap-0.5">
          {WEEKDAY_LABELS.map((wd, i) => (
            <div key={`${wd}-${i}`} className="py-0.5 text-center text-[9px] font-bold tracking-wide text-violet-400">
              {wd}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {calendarCells.map((cell, index) => {
            if (!cell) return <div key={`e-${index}`} className="aspect-square" />;
            const anchor = cellToAnchor(cell);
            const selected = value === anchor;
            const isToday = today === anchor;
            const isPast = anchor < today;
            return (
              <button
                key={anchor}
                type="button"
                disabled={isPast}
                onClick={() => {
                  onChange(anchor);
                  setOpen(false);
                }}
                className={`aspect-square rounded-lg text-[11px] font-semibold transition ${
                  selected
                    ? 'bg-violet-600 text-white shadow-sm shadow-violet-600/30'
                    : isPast
                      ? 'cursor-not-allowed text-slate-300'
                      : isToday
                        ? 'bg-violet-50 text-violet-800 ring-1 ring-violet-300'
                        : 'text-slate-800 hover:bg-violet-50'
                }`}
              >
                {cell.day}
              </button>
            );
          })}
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          ...triggerStyle,
          borderColor: open ? '#7C3AED' : '#E2E8F0',
          boxShadow: open ? '0 0 0 3px rgba(124,58,237,0.12)' : 'none',
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span>{value ? formatDateLabel(value) : 'Elegí el día'}</span>
        <svg className="h-3.5 w-3.5 shrink-0 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      </button>
      {panel}
    </>
  );
}

export function ScheduleTimePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const { buttonRef, panelRef, coords } = useAnchoredPopover(open, () => setOpen(false));
  const { hour, minute } = parseTimeParts(value);
  const hourRefs = useRef({});
  const minuteRefs = useRef({});
  const hourListRef = useRef(null);
  const minuteListRef = useRef(null);

  useLayoutEffect(() => {
    if (!open || !coords) return undefined;
    const now = currentArTimeParts();
    let cancelled = false;
    let innerFrame = 0;
    const run = () => {
      if (cancelled) return;
      scrollChildIntoView(hourRefs.current[hour] || hourRefs.current[now.hour], hourListRef.current);
      scrollChildIntoView(minuteRefs.current[minute] || minuteRefs.current[now.minute], minuteListRef.current);
    };
    const outerFrame = window.requestAnimationFrame(() => {
      innerFrame = window.requestAnimationFrame(run);
    });
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(outerFrame);
      window.cancelAnimationFrame(innerFrame);
    };
  }, [open, coords, hour, minute]);

  const pick = (nextHour, nextMinute) => {
    onChange(`${nextHour}:${nextMinute}`);
  };

  const panel = open && coords && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Elegir hora"
        className="fixed z-[10050] overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-2xl shadow-violet-900/15"
        style={{ top: coords.top, left: coords.left, width: coords.width }}
      >
        <div className="grid grid-cols-2 border-b border-violet-100 bg-violet-50/80 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-violet-500">
          <span>Hora</span>
          <span>Min</span>
        </div>
        <div className="grid grid-cols-2">
          <div ref={hourListRef} className="max-h-[220px] overflow-y-auto overscroll-contain border-r border-violet-100 py-[88px]">
            {HOURS_24.map((h) => {
              const selected = h === hour;
              return (
                <button
                  key={h}
                  type="button"
                  ref={(el) => { hourRefs.current[h] = el; }}
                  onClick={() => pick(h, minute)}
                  className={`flex w-full items-center justify-center py-1.5 text-[13px] font-semibold tabular-nums ${
                    selected
                      ? 'bg-violet-600 text-white'
                      : 'text-slate-700 hover:bg-violet-50'
                  }`}
                >
                  {h}
                </button>
              );
            })}
          </div>
          <div ref={minuteListRef} className="max-h-[220px] overflow-y-auto overscroll-contain py-[88px]">
            {MINUTES.map((m) => {
              const selected = m === minute;
              return (
                <button
                  key={m}
                  type="button"
                  ref={(el) => { minuteRefs.current[m] = el; }}
                  onClick={() => {
                    pick(hour, m);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-center py-1.5 text-[13px] font-semibold tabular-nums ${
                    selected
                      ? 'bg-violet-600 text-white'
                      : 'text-slate-700 hover:bg-violet-50'
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          ...triggerStyle,
          borderColor: open ? '#7C3AED' : '#E2E8F0',
          boxShadow: open ? '0 0 0 3px rgba(124,58,237,0.12)' : 'none',
        }}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span>{hour}:{minute} hs</span>
        <svg className="h-3.5 w-3.5 shrink-0 text-violet-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
      {panel}
    </>
  );
}
