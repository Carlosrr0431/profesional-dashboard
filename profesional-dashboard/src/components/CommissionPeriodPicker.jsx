import { useMemo, useState, useEffect } from 'react';
import {
  buildCalendarGrid,
  getMonthNamesShort,
  isDayInWeek,
  isMonthSelected,
  parseAnchorString,
  resolveCommissionPeriod,
  toAnchorString,
} from '../lib/commissionPaymentPeriods';

const MODE_OPTIONS = [
  { key: 'week', label: 'Semana' },
  { key: 'month', label: 'Mes' },
  { key: 'all', label: 'Todo' },
];

const WEEKDAY_LABELS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];

export default function CommissionPeriodPicker({
  mode,
  onModeChange,
  anchorDate,
  onAnchorChange,
  compact = false,
  useModal = false,
}) {
  const anchorParts = parseAnchorString(anchorDate);
  const [viewYear, setViewYear] = useState(anchorParts.year);
  const [viewMonth, setViewMonth] = useState(anchorParts.month);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    const parts = parseAnchorString(anchorDate);
    setViewYear(parts.year);
    setViewMonth(parts.month);
  }, [anchorDate]);

  const periodInfo = useMemo(
    () => resolveCommissionPeriod(mode, anchorDate),
    [mode, anchorDate],
  );

  const handleModeChange = (nextMode) => {
    onModeChange(nextMode);
    if (nextMode !== 'all') {
      onAnchorChange(toAnchorString(new Date()));
    }
    if (nextMode === 'all') {
      setModalOpen(false);
    }
  };

  const handleDayClick = (cell) => {
    if (!cell) return;
    onAnchorChange(toAnchorString(saltaCellDate(cell)));
    setViewYear(cell.year);
    setViewMonth(cell.month);
    if (useModal) setModalOpen(false);
  };

  const handleMonthClick = (month) => {
    onAnchorChange(`${viewYear}-${String(month).padStart(2, '0')}-01`);
    setViewMonth(month);
    if (useModal) setModalOpen(false);
  };

  const calendarProps = {
    mode,
    anchorDate,
    viewYear,
    viewMonth,
    setViewYear,
    setViewMonth,
    onDayClick: handleDayClick,
    onMonthClick: handleMonthClick,
    compact,
  };

  return (
    <div className={`${compact ? 'space-y-2' : 'space-y-3'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 bg-light-300/60 rounded-xl p-1">
          {MODE_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => handleModeChange(option.key)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all ${
                mode === option.key
                  ? 'bg-accent text-white shadow-md shadow-accent/20'
                  : 'text-gray-400 hover:text-navy-900'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {mode !== 'all' ? (
          <>
            {useModal ? (
              <button
                type="button"
                onClick={() => setModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-navy-900 bg-light-50 border border-light-300/60 rounded-lg hover:border-accent/40 hover:bg-accent/5 transition-all"
              >
                <svg className="w-3.5 h-3.5 text-accent flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="truncate max-w-[200px]">{periodInfo.label}</span>
              </button>
            ) : (
              <p className="text-xs text-gray-500">
                Período: <span className="font-semibold text-navy-900">{periodInfo.label}</span>
              </p>
            )}
            <button
              type="button"
              onClick={() => onAnchorChange(toAnchorString(new Date()))}
              className="text-[10px] font-semibold text-accent hover:text-accent-light px-2 py-1 rounded-lg bg-accent/10"
            >
              Hoy
            </button>
          </>
        ) : null}
      </div>

      {!useModal && mode !== 'all' ? (
        <CommissionPeriodCalendar {...calendarProps} />
      ) : null}

      {useModal && modalOpen && mode !== 'all' ? (
        <div
          className="fixed inset-0 z-[120] bg-navy-900/45 backdrop-blur-[1px] flex items-center justify-center p-4"
          onClick={() => setModalOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-light-50 rounded-2xl border border-light-300/50 shadow-2xl shadow-navy-900/25 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-light-300/40">
              <div>
                <h3 className="text-sm font-bold text-navy-900">Elegir período</h3>
                <p className="text-[10px] text-gray-500 mt-0.5">{periodInfo.label}</p>
              </div>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="w-8 h-8 rounded-lg bg-light-200 text-gray-500 hover:text-navy-900 flex items-center justify-center"
                aria-label="Cerrar"
              >
                ×
              </button>
            </div>
            <div className="p-4">
              <CommissionPeriodCalendar {...calendarProps} />
            </div>
            <div className="px-4 py-3 border-t border-light-300/40 flex justify-end">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-white bg-accent rounded-lg hover:bg-accent-light transition-all"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CommissionPeriodCalendar({
  mode,
  anchorDate,
  viewYear,
  viewMonth,
  setViewYear,
  setViewMonth,
  onDayClick,
  onMonthClick,
  compact,
}) {
  const calendarCells = useMemo(
    () => buildCalendarGrid(viewYear, viewMonth),
    [viewYear, viewMonth],
  );
  const monthNames = getMonthNamesShort();

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

  if (mode === 'week') {
    return (
      <div className={`bg-light-50 border border-light-300/50 rounded-xl ${compact ? 'p-2' : 'p-3'}`}>
        <div className="flex items-center justify-between mb-2">
          <button
            type="button"
            onClick={() => shiftViewMonth(-1)}
            className="w-7 h-7 rounded-lg text-gray-500 hover:bg-light-200 flex items-center justify-center"
            aria-label="Mes anterior"
          >
            ‹
          </button>
          <span className="text-xs font-semibold text-navy-900 capitalize">{viewMonthLabel}</span>
          <button
            type="button"
            onClick={() => shiftViewMonth(1)}
            className="w-7 h-7 rounded-lg text-gray-500 hover:bg-light-200 flex items-center justify-center"
            aria-label="Mes siguiente"
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 gap-0.5 mb-1">
          {WEEKDAY_LABELS.map((label, i) => (
            <div key={`wd-${i}`} className="text-[9px] text-center text-gray-400 font-semibold py-0.5">
              {label}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-0.5">
          {calendarCells.map((cell, index) => {
            if (!cell) {
              return <div key={`empty-${index}`} className="aspect-square" />;
            }
            const inWeek = isDayInWeek(cell.year, cell.month, cell.day, anchorDate);
            const isToday = toAnchorString(new Date()) === toAnchorString(saltaCellDate(cell));
            return (
              <button
                key={`${cell.year}-${cell.month}-${cell.day}`}
                type="button"
                onClick={() => onDayClick(cell)}
                className={`aspect-square rounded-lg text-[11px] font-medium transition-all ${
                  inWeek
                    ? 'bg-accent text-white shadow-sm'
                    : isToday
                      ? 'ring-1 ring-accent/40 text-accent bg-accent/5'
                      : 'text-navy-900 hover:bg-light-200'
                }`}
              >
                {cell.day}
              </button>
            );
          })}
        </div>
        <p className="text-[9px] text-gray-400 mt-2 text-center">
          Tocá un día para ver la semana (lun–dom) que lo contiene
        </p>
      </div>
    );
  }

  if (mode === 'month') {
    return (
      <div className={`bg-light-50 border border-light-300/50 rounded-xl ${compact ? 'p-2' : 'p-3'}`}>
        <div className="flex items-center justify-between mb-3">
          <button
            type="button"
            onClick={() => setViewYear((y) => y - 1)}
            className="w-7 h-7 rounded-lg text-gray-500 hover:bg-light-200 flex items-center justify-center"
            aria-label="Año anterior"
          >
            ‹
          </button>
          <span className="text-sm font-bold text-navy-900">{viewYear}</span>
          <button
            type="button"
            onClick={() => setViewYear((y) => y + 1)}
            className="w-7 h-7 rounded-lg text-gray-500 hover:bg-light-200 flex items-center justify-center"
            aria-label="Año siguiente"
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {monthNames.map((name, index) => {
            const month = index + 1;
            const selected = isMonthSelected(viewYear, month, anchorDate);
            return (
              <button
                key={name}
                type="button"
                onClick={() => onMonthClick(month)}
                className={`py-2 rounded-lg text-xs font-semibold transition-all ${
                  selected
                    ? 'bg-accent text-white shadow-sm'
                    : 'bg-light-200/80 text-navy-900 hover:bg-light-300'
                }`}
              >
                {name}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}

function saltaCellDate(cell) {
  return new Date(
    `${cell.year}-${String(cell.month).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}T12:00:00-03:00`,
  );
}
