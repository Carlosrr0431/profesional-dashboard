'use client';

import { useRef, useState } from 'react';
import { formatPrice } from '../../lib/utils';

const CHART_COLORS = ['#E11D48', '#0F172A', '#22C55E', '#F59E0B', '#6366F1', '#94A3B8', '#06B6D4', '#EC4899'];

export function formatDayShort(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

export function EmptyChart({ message = 'Sin datos' }) {
  return (
    <div className="flex h-[180px] items-center justify-center">
      <p className="text-[13px] text-gray-300">{message}</p>
    </div>
  );
}

function niceMax(value) {
  const n = Number(value) || 0;
  if (n <= 0) return 1;
  const exp = 10 ** Math.floor(Math.log10(n));
  const mant = n / exp;
  const nice = mant <= 1 ? 1 : mant <= 2 ? 2 : mant <= 5 ? 5 : 10;
  return nice * exp;
}

function formatAxisNumber(value, { money = false } = {}) {
  const n = Number(value) || 0;
  if (money) {
    if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1000) return `$${Math.round(n / 1000)}k`;
    return `$${Math.round(n)}`;
  }
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  return String(Math.round(n));
}

function ChartTooltip({ title, rows, style }) {
  return (
    <div
      className="pointer-events-none absolute z-20 min-w-[132px] rounded-xl border border-slate-200/80 bg-white px-3 py-2 shadow-lg shadow-slate-900/10"
      style={style}
    >
      {title ? <p className="mb-1 text-[10px] font-semibold text-slate-500">{title}</p> : null}
      {rows.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-slate-500">
            {row.color ? (
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: row.color }} />
            ) : null}
            {row.label}
          </span>
          <span className="font-semibold tabular-nums text-navy-900">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

export function AreaTrendChart({
  data,
  valueKey = 'count',
  color = '#E11D48',
  money = false,
  valueLabel = 'Valor',
}) {
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);

  if (!data?.length) return <EmptyChart message="Sin viajes en el período" />;

  const max = niceMax(Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1));
  const padX = 2;
  const padY = 6;
  const w = 100;
  const h = 100;
  const innerW = w - padX * 2;
  const innerH = h - padY * 2;
  const yTicks = [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({
    ratio,
    value: max * ratio,
  }));

  const coords = data.map((item, index) => {
    const x = padX + (index / Math.max(data.length - 1, 1)) * innerW;
    const y = padY + innerH - ((Number(item[valueKey]) || 0) / max) * innerH;
    return { x, y, index, ...item, value: Number(item[valueKey]) || 0 };
  });

  const line = coords.map((p) => `${p.x},${p.y}`).join(' ');
  const area = `${coords[0].x},${padY + innerH} ${line} ${coords[coords.length - 1].x},${padY + innerH}`;
  const gradId = `areaFill-${valueKey}-${money ? 'm' : 'c'}`;

  const onMove = (event) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const index = Math.round(ratio * (coords.length - 1));
    const point = coords[index];
    if (!point) return;
    setHover({
      point,
      left: Math.min(rect.width - 140, Math.max(8, (point.x / w) * rect.width - 70)),
    });
  };

  const xLabels = data.length <= 8
    ? data
    : [data[0], data[Math.floor(data.length / 2)], data[data.length - 1]].filter(Boolean);

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="flex h-[180px] w-10 flex-col justify-between py-1">
          {yTicks.map((tick) => (
            <span key={tick.ratio} className="text-right text-[10px] tabular-nums text-gray-400">
              {formatAxisNumber(tick.value, { money })}
            </span>
          ))}
        </div>

        <div
          ref={wrapRef}
          className="relative min-w-0 flex-1 cursor-crosshair"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <svg viewBox={`0 0 ${w} ${h}`} className="h-[180px] w-full" preserveAspectRatio="none">
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.18" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            {yTicks.map((tick) => (
              <line
                key={tick.ratio}
                x1={padX}
                x2={w - padX}
                y1={padY + innerH * (1 - tick.ratio)}
                y2={padY + innerH * (1 - tick.ratio)}
                stroke="#E2E8F0"
                strokeWidth="0.35"
              />
            ))}
            <polygon points={area} fill={`url(#${gradId})`} />
            <polyline
              points={line}
              fill="none"
              stroke={color}
              strokeWidth="1.4"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            {hover ? (
              <>
                <line
                  x1={hover.point.x}
                  x2={hover.point.x}
                  y1={padY}
                  y2={padY + innerH}
                  stroke={color}
                  strokeWidth="0.5"
                  strokeDasharray="1.5 1.5"
                  vectorEffect="non-scaling-stroke"
                />
                <circle
                  cx={hover.point.x}
                  cy={hover.point.y}
                  r="1.8"
                  fill="#fff"
                  stroke={color}
                  strokeWidth="1.2"
                  vectorEffect="non-scaling-stroke"
                />
              </>
            ) : null}
          </svg>

          {hover ? (
            <ChartTooltip
              title={formatDayShort(hover.point.date)}
              rows={[{
                label: valueLabel,
                value: money ? formatPrice(hover.point.value) : hover.point.value,
                color,
              }]}
              style={{ top: 8, left: hover.left }}
            />
          ) : null}
        </div>
      </div>

      <div className="mt-2 flex justify-between pl-12 pr-1">
        {xLabels.map((item) => (
          <span key={item.date} className="text-[10px] text-gray-400">{formatDayShort(item.date)}</span>
        ))}
      </div>
    </div>
  );
}

export function StackedDailyChart({ data }) {
  const [hover, setHover] = useState(null);

  if (!data?.length) return <EmptyChart message="Sin actividad diaria" />;

  const max = niceMax(Math.max(...data.map((d) => (d.completed || 0) + (d.cancelled || 0)), 1));
  const sample = data.length > 18
    ? data.filter((_, i) => i % Math.ceil(data.length / 18) === 0 || i === data.length - 1)
    : data;
  const yTicks = [1, 0.5, 0].map((ratio) => ({ ratio, value: max * ratio }));

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="flex h-[180px] w-8 flex-col justify-between py-1">
          {yTicks.map((tick) => (
            <span key={tick.ratio} className="text-right text-[10px] tabular-nums text-gray-400">
              {formatAxisNumber(tick.value)}
            </span>
          ))}
        </div>
        <div className="relative flex h-[180px] min-w-0 flex-1 items-end gap-1">
          {sample.map((item) => {
            const completedH = Math.round(((item.completed || 0) / max) * 100);
            const cancelledH = Math.round(((item.cancelled || 0) / max) * 100);
            const active = hover?.date === item.date;
            return (
              <div
                key={item.date}
                className="relative flex min-w-0 flex-1 flex-col items-center gap-1"
                onMouseEnter={() => setHover(item)}
                onMouseLeave={() => setHover(null)}
              >
                <div className="flex h-[140px] w-full items-end justify-center">
                  <div className={`flex w-full max-w-[16px] flex-col justify-end overflow-hidden rounded-t-md transition ${active ? 'opacity-100 ring-2 ring-navy-900/10' : 'opacity-90'}`}>
                    <div className="w-full bg-rose-400" style={{ height: `${Math.max(cancelledH > 0 ? 3 : 0, cancelledH)}%` }} />
                    <div className="w-full bg-emerald-500" style={{ height: `${Math.max(completedH > 0 ? 3 : 0, completedH)}%` }} />
                  </div>
                </div>
                <span className="w-full truncate text-center text-[8px] text-gray-400">
                  {formatDayShort(item.date)}
                </span>
              </div>
            );
          })}
          {hover ? (
            <ChartTooltip
              title={formatDayShort(hover.date)}
              rows={[
                { label: 'Completados', value: hover.completed || 0, color: '#22C55E' },
                { label: 'Cancelados', value: hover.cancelled || 0, color: '#FB7185' },
                { label: 'Total', value: (hover.completed || 0) + (hover.cancelled || 0) },
              ]}
              style={{ top: 4, left: '50%', transform: 'translateX(-50%)' }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function ColumnChart({ data, labelKey = 'label', color = 'bg-navy-900/85', valueLabel = 'Cantidad' }) {
  const [hover, setHover] = useState(null);

  if (!data?.length) return <EmptyChart />;

  const max = niceMax(Math.max(...data.map((d) => d.count), 1));
  const yTicks = [1, 0.5, 0].map((ratio) => ({ ratio, value: max * ratio }));
  const barColor = color.includes('sky') ? '#0284C7' : '#0F172A';

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="flex h-[180px] w-8 flex-col justify-between py-1">
          {yTicks.map((tick) => (
            <span key={tick.ratio} className="text-right text-[10px] tabular-nums text-gray-400">
              {formatAxisNumber(tick.value)}
            </span>
          ))}
        </div>
        <div className="relative flex h-[180px] min-w-0 flex-1 items-end gap-[3px]">
          {data.map((item, index) => {
            const height = Math.max(4, Math.round((item.count / max) * 100));
            const key = item.key ?? item.hour ?? item.label ?? index;
            const active = hover?.key === key;
            return (
              <div
                key={key}
                className="relative flex min-w-0 flex-1 flex-col items-center gap-1.5"
                onMouseEnter={() => setHover({ key, item })}
                onMouseLeave={() => setHover(null)}
              >
                <div className="flex h-[140px] w-full items-end justify-center">
                  <div
                    className={`w-full max-w-[14px] rounded-t-md transition-all duration-300 ${color} ${active ? 'opacity-100' : 'opacity-85'}`}
                    style={{ height: `${height}%` }}
                  />
                </div>
                <span className="w-full truncate text-center text-[9px] text-gray-400">{item[labelKey]}</span>
              </div>
            );
          })}
          {hover ? (
            <ChartTooltip
              title={String(hover.item[labelKey] ?? '')}
              rows={[{ label: valueLabel, value: hover.item.count, color: barColor }]}
              style={{ top: 4, left: '50%', transform: 'translateX(-50%)' }}
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function DonutChart({ items, size = 128 }) {
  const [hoverKey, setHoverKey] = useState(null);

  if (!items?.length) return <EmptyChart />;

  const total = items.reduce((sum, item) => sum + item.count, 0) || 1;
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const hoverItem = items.find((item) => item.key === hoverKey) || null;

  return (
    <div className="relative flex items-center gap-6">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
          <circle cx="18" cy="18" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="4" />
          {items.map((item, index) => {
            const length = (item.count / total) * circumference;
            const dash = `${length} ${circumference - length}`;
            const active = hoverKey === item.key;
            const circle = (
              <circle
                key={item.key}
                cx="18"
                cy="18"
                r={radius}
                fill="none"
                stroke={CHART_COLORS[index % CHART_COLORS.length]}
                strokeWidth={active ? 5 : 4}
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="round"
                className="cursor-pointer"
                onMouseEnter={() => setHoverKey(item.key)}
                onMouseLeave={() => setHoverKey(null)}
              />
            );
            offset += length;
            return circle;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold tabular-nums text-navy-900">
            {hoverItem ? hoverItem.count : total}
          </span>
          <span className="max-w-[72px] truncate text-center text-[9px] uppercase tracking-wider text-gray-400">
            {hoverItem ? hoverItem.label : 'total'}
          </span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {items.map((item, index) => (
          <div
            key={item.key}
            className={`flex min-w-0 cursor-default items-center gap-2 rounded-lg px-1.5 py-1 transition ${
              hoverKey === item.key ? 'bg-slate-50' : ''
            }`}
            onMouseEnter={() => setHoverKey(item.key)}
            onMouseLeave={() => setHoverKey(null)}
          >
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
            />
            <span className="flex-1 truncate text-[11px] text-gray-500">{item.label}</span>
            <span className="text-[11px] font-medium tabular-nums text-navy-900">{item.count}</span>
          </div>
        ))}
      </div>
      {hoverItem ? (
        <ChartTooltip
          title={hoverItem.label}
          rows={[
            { label: 'Cantidad', value: hoverItem.count },
            { label: 'Porcentaje', value: `${Math.round((hoverItem.count / total) * 100)}%` },
          ]}
          style={{ top: 0, right: 0 }}
        />
      ) : null}
    </div>
  );
}

export function HorizontalBars({ items, maxBars = 8, valueFormatter = null }) {
  const [hoverKey, setHoverKey] = useState(null);

  if (!items?.length) return <EmptyChart />;

  const slice = items.slice(0, maxBars);
  const max = Math.max(...slice.map((d) => d.count), 1);
  const hoverItem = slice.find((item) => (item.key ?? item.label) === hoverKey) || null;

  return (
    <div className="relative space-y-3">
      {slice.map((item, index) => {
        const key = item.key ?? item.label ?? index;
        const active = hoverKey === key;
        return (
          <div
            key={key}
            className={`rounded-lg px-1 py-0.5 transition ${active ? 'bg-slate-50' : ''}`}
            onMouseEnter={() => setHoverKey(key)}
            onMouseLeave={() => setHoverKey(null)}
          >
            <div className="mb-1.5 flex items-center justify-between gap-3">
              <span className="truncate text-[11px] text-gray-600">{item.label}</span>
              <span className="text-[11px] font-medium tabular-nums text-navy-900">
                {valueFormatter ? valueFormatter(item) : item.count}
              </span>
            </div>
            <div className="h-1 overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-navy-900/80 transition-all duration-500"
                style={{ width: `${Math.max(4, (item.count / max) * 100)}%` }}
              />
            </div>
          </div>
        );
      })}
      {hoverItem ? (
        <ChartTooltip
          title={hoverItem.label}
          rows={[{
            label: 'Valor',
            value: valueFormatter ? valueFormatter(hoverItem) : hoverItem.count,
          }]}
          style={{ top: 0, right: 0 }}
        />
      ) : null}
    </div>
  );
}

export { CHART_COLORS };
