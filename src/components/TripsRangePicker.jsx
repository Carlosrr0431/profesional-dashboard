'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildCalendarGrid,
  getMonthNamesShort,
  isDayInWeek,
  isMonthSelected,
  parseAnchorString,
  resolveTripsViewRange,
  toAnchorString,
} from '../lib/commissionPaymentPeriods';

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

function cellToAnchor(cell) {
  return `${cell.year}-${String(cell.month).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
}

/**
 * Selector compacto de semana/mes para Viajes: popover anclado a la barra, sin modal fullscreen.
 */
export default function TripsRangePicker({
  mode,
  anchorDate,
  onAnchorChange,
  label,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const parts = parseAnchorString(anchorDate);
  const [viewYear, setViewYear] = useState(parts.year);
  const [viewMonth, setViewMonth] = useState(parts.month);

  useEffect(() => {
    const next = parseAnchorString(anchorDate);
    setViewYear(next.year);
    setViewMonth(next.month);
  }, [anchorDate]);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const displayLabel = label || resolveTripsViewRange(mode, anchorDate).label;
  const monthNames = getMonthNamesShort();
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

  const pickDay = (cell) => {
    if (!cell) return;
    onAnchorChange(cellToAnchor(cell));
    setViewYear(cell.year);
    setViewMonth(cell.month);
    setOpen(false);
  };

  const pickMonth = (month) => {
    onAnchorChange(`${viewYear}-${String(month).padStart(2, '0')}-01`);
    setViewMonth(month);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex h-7 max-w-[220px] items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold text-navy-900 hover:bg-slate-50"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span className="truncate">{displayLabel}</span>
        <svg className={`h-3 w-3 shrink-0 text-slate-400 transition ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[280px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-900/10">
          {mode === 'week' ? (
            <>
              <div className="mb-2 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => shiftViewMonth(-1)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50"
                  aria-label="Mes anterior"
                >
                  ‹
                </button>
                <span className="text-[12px] font-semibold capitalize text-navy-900">{viewMonthLabel}</span>
                <button
                  type="button"
                  onClick={() => shiftViewMonth(1)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50"
                  aria-label="Mes siguiente"
                >
                  ›
                </button>
              </div>
              <div className="mb-1 grid grid-cols-7 gap-0.5">
                {WEEKDAY_LABELS.map((wd, i) => (
                  <div key={`${wd}-${i}`} className="py-0.5 text-center text-[9px] font-semibold text-slate-400">
                    {wd}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {calendarCells.map((cell, index) => {
                  if (!cell) return <div key={`e-${index}`} className="aspect-square" />;
                  const inWeek = isDayInWeek(cell.year, cell.month, cell.day, anchorDate);
                  const isToday = toAnchorString(new Date()) === cellToAnchor(cell);
                  return (
                    <button
                      key={cellToAnchor(cell)}
                      type="button"
                      onClick={() => pickDay(cell)}
                      className={`aspect-square rounded-lg text-[11px] font-medium transition ${
                        inWeek
                          ? 'bg-navy-900 text-white shadow-sm'
                          : isToday
                            ? 'bg-slate-100 text-navy-900 ring-1 ring-navy-900/20'
                            : 'text-navy-900 hover:bg-slate-50'
                      }`}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-center text-[10px] text-slate-400">
                Elegí un día para ver su semana (lun–dom)
              </p>
            </>
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setViewYear((y) => y - 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50"
                  aria-label="Año anterior"
                >
                  ‹
                </button>
                <span className="text-[13px] font-bold text-navy-900">{viewYear}</span>
                <button
                  type="button"
                  onClick={() => setViewYear((y) => y + 1)}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50"
                  aria-label="Año siguiente"
                >
                  ›
                </button>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {monthNames.map((name, index) => {
                  const month = index + 1;
                  const selected = isMonthSelected(viewYear, month, anchorDate);
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => pickMonth(month)}
                      className={`rounded-lg py-2 text-[11px] font-semibold transition ${
                        selected
                          ? 'bg-navy-900 text-white shadow-sm'
                          : 'bg-slate-50 text-navy-900 hover:bg-slate-100'
                      }`}
                    >
                      {name}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
