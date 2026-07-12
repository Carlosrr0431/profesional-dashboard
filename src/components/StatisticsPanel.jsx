'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import Map, { Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SALTA_CENTER, DEFAULT_ZOOM } from '../lib/constants';
import { MAP_STYLE_URL, DEFAULT_MAP_VIEW, mapLibreOptions } from '../lib/mapLibre';
import { formatPrice, formatKm, formatDuration } from '../lib/utils';

const HEATMAP_LAYER = {
  id: 'trip-heatmap',
  type: 'heatmap',
  paint: {
    'heatmap-weight': ['get', 'weight'],
    'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 10, 0.8, 15, 2.2],
    'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 10, 12, 15, 32],
    'heatmap-opacity': 0.88,
    'heatmap-color': [
      'interpolate',
      ['linear'],
      ['heatmap-density'],
      0, 'rgba(191, 219, 254, 0)',
      0.15, 'rgba(191, 219, 254, 0.65)',
      0.35, 'rgba(134, 239, 172, 0.85)',
      0.55, 'rgba(253, 230, 138, 0.9)',
      0.75, 'rgba(252, 165, 165, 0.95)',
      1, 'rgba(239, 68, 68, 1)',
    ],
  },
};

function buildHeatmapGeoJSON(points) {
  const features = (points || [])
    .filter((point) => Number.isFinite(Number(point?.lat)) && Number.isFinite(Number(point?.lng)))
    .map((point) => ({
      type: 'Feature',
      properties: {
        weight: Number(point.weight) > 0 ? Number(point.weight) : 1,
      },
      geometry: {
        type: 'Point',
        coordinates: [Number(point.lng), Number(point.lat)],
      },
    }));

  return { type: 'FeatureCollection', features };
}

const QUICK_PERIODS = [
  { key: '7d', label: '7 días' },
  { key: '30d', label: '30 días' },
  { key: '90d', label: '90 días' },
  { key: 'all', label: 'Todo' },
];

const LOCATION_VIEW_OPTIONS = [
  { key: 'pickup', label: 'Retiro' },
  { key: 'destination', label: 'Destino' },
  { key: 'combined', label: 'Combinado' },
];

const STATUS_LABELS = {
  pending: 'Pendiente',
  queued: 'En cola',
  scheduled: 'Programado',
  accepted: 'Asignado',
  going_to_pickup: 'En camino',
  in_progress: 'En curso',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

const SOURCE_LABELS = {
  passenger_app: 'App pasajeros',
  whatsapp: 'WhatsApp',
  dashboard: 'Dashboard',
  otro: 'Otro',
};

const CHART_COLORS = ['#E11D48', '#0F172A', '#22C55E', '#F59E0B', '#6366F1', '#94A3B8', '#06B6D4', '#EC4899'];

function formatHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function formatDayShort(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
}

function formatMonthLabel(monthStr) {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
}

function EmptyChart({ message = 'Sin datos' }) {
  return (
    <div className="flex h-[180px] items-center justify-center">
      <p className="text-[13px] text-gray-300">{message}</p>
    </div>
  );
}

function Panel({ title, hint, children, className = '', action = null }) {
  return (
    <section className={`rounded-[20px] bg-white p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold tracking-tight text-navy-900">{title}</h3>
          {hint ? <p className="mt-0.5 text-[11px] text-gray-400">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, detail }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] uppercase tracking-[0.12em] text-gray-400">{label}</p>
      <p className="text-[22px] font-semibold leading-none tracking-tight text-navy-900 tabular-nums">{value}</p>
      {detail ? <p className="mt-1.5 text-[11px] text-gray-400">{detail}</p> : null}
    </div>
  );
}

function AreaTrendChart({ data, valueKey = 'count', color = '#E11D48' }) {
  if (!data?.length) return <EmptyChart message="Sin viajes en el período" />;

  const max = Math.max(...data.map((d) => Number(d[valueKey]) || 0), 1);
  const pad = 8;
  const w = 100;
  const h = 100;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  const coords = data.map((item, index) => {
    const x = pad + (index / Math.max(data.length - 1, 1)) * innerW;
    const y = pad + innerH - ((Number(item[valueKey]) || 0) / max) * innerH;
    return { x, y, ...item };
  });

  const line = coords.map((p) => `${p.x},${p.y}`).join(' ');
  const area = `${coords[0].x},${pad + innerH} ${line} ${coords[coords.length - 1].x},${pad + innerH}`;
  const gradId = `areaFill-${valueKey}`;

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-[180px] w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((ratio) => (
          <line
            key={ratio}
            x1={pad}
            x2={w - pad}
            y1={pad + innerH * (1 - ratio)}
            y2={pad + innerH * (1 - ratio)}
            stroke="#F1F5F9"
            strokeWidth="0.4"
          />
        ))}
        <polygon points={area} fill={`url(#${gradId})`} />
        <polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth="1.2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <div className="mt-2 flex justify-between px-0.5">
        {data.length <= 8
          ? data.map((item) => (
            <span key={item.date} className="text-[10px] text-gray-400">{formatDayShort(item.date)}</span>
          ))
          : [data[0], data[Math.floor(data.length / 2)], data[data.length - 1]].filter(Boolean).map((item) => (
            <span key={item.date} className="text-[10px] text-gray-400">{formatDayShort(item.date)}</span>
          ))}
      </div>
    </div>
  );
}

function StackedDailyChart({ data }) {
  if (!data?.length) return <EmptyChart message="Sin actividad diaria" />;

  const max = Math.max(...data.map((d) => (d.completed || 0) + (d.cancelled || 0)), 1);
  const sample = data.length > 14
    ? data.filter((_, i) => i % Math.ceil(data.length / 14) === 0 || i === data.length - 1)
    : data;

  return (
    <div className="h-[180px] flex items-end gap-1">
      {sample.map((item) => {
        const completedH = Math.round(((item.completed || 0) / max) * 100);
        const cancelledH = Math.round(((item.cancelled || 0) / max) * 100);
        return (
          <div key={item.date} className="flex min-w-0 flex-1 flex-col items-center gap-1">
            <span className="text-[8px] tabular-nums text-gray-400">
              {(item.completed || 0) + (item.cancelled || 0)}
            </span>
            <div className="flex h-[120px] w-full items-end justify-center">
              <div className="flex w-full max-w-[16px] flex-col justify-end overflow-hidden rounded-t-md">
                <div className="w-full bg-rose-400" style={{ height: `${Math.max(cancelledH > 0 ? 4 : 0, cancelledH)}%` }} />
                <div className="w-full bg-emerald-500" style={{ height: `${Math.max(completedH > 0 ? 4 : 0, completedH)}%` }} />
              </div>
            </div>
            <span className="w-full truncate text-center text-[8px] text-gray-400">
              {formatDayShort(item.date)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ColumnChart({ data, labelKey = 'label', color = 'bg-navy-900/85' }) {
  if (!data?.length) return <EmptyChart />;

  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="flex h-[180px] items-end gap-[3px]">
      {data.map((item, index) => {
        const height = Math.max(6, Math.round((item.count / max) * 100));
        return (
          <div key={item.key ?? item.hour ?? item.label ?? index} className="flex min-w-0 flex-1 flex-col items-center gap-1.5">
            <span className="text-[9px] tabular-nums text-gray-400">{item.count}</span>
            <div className="flex h-[120px] w-full items-end justify-center">
              <div
                className={`w-full max-w-[14px] rounded-t-md transition-all duration-500 ${color}`}
                style={{ height: `${height}%` }}
              />
            </div>
            <span className="w-full truncate text-center text-[9px] text-gray-400">{item[labelKey]}</span>
          </div>
        );
      })}
    </div>
  );
}

function DonutChart({ items, size = 128 }) {
  if (!items?.length) return <EmptyChart />;

  const total = items.reduce((sum, item) => sum + item.count, 0) || 1;
  const radius = 16;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;

  return (
    <div className="flex items-center gap-6">
      <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
        <svg viewBox="0 0 36 36" className="h-full w-full -rotate-90">
          <circle cx="18" cy="18" r={radius} fill="none" stroke="#F1F5F9" strokeWidth="4" />
          {items.map((item, index) => {
            const length = (item.count / total) * circumference;
            const dash = `${length} ${circumference - length}`;
            const circle = (
              <circle
                key={item.key}
                cx="18"
                cy="18"
                r={radius}
                fill="none"
                stroke={CHART_COLORS[index % CHART_COLORS.length]}
                strokeWidth="4"
                strokeDasharray={dash}
                strokeDashoffset={-offset}
                strokeLinecap="round"
              />
            );
            offset += length;
            return circle;
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-semibold tabular-nums text-navy-900">{total}</span>
          <span className="text-[9px] uppercase tracking-wider text-gray-400">total</span>
        </div>
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        {items.map((item, index) => (
          <div key={item.key} className="flex min-w-0 items-center gap-2">
            <span
              className="h-2 w-2 flex-shrink-0 rounded-full"
              style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
            />
            <span className="flex-1 truncate text-[11px] text-gray-500">{item.label}</span>
            <span className="text-[11px] font-medium tabular-nums text-navy-900">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HorizontalBars({ items, maxBars = 8, valueFormatter = null }) {
  if (!items?.length) return <EmptyChart />;

  const slice = items.slice(0, maxBars);
  const max = Math.max(...slice.map((d) => d.count), 1);

  return (
    <div className="space-y-3">
      {slice.map((item, index) => (
        <div key={item.key ?? item.label ?? index}>
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
      ))}
    </div>
  );
}

function LocationViewToggle({ value, onChange, views }) {
  return (
    <div className="inline-flex rounded-full bg-gray-50 p-0.5 ring-1 ring-gray-100">
      {LOCATION_VIEW_OPTIONS.map((option) => {
        const meta = views?.[option.key];
        const count = meta?.pointCount ?? 0;
        return (
          <button
            key={option.key}
            type="button"
            onClick={() => onChange(option.key)}
            className={`rounded-full px-3 py-1.5 text-[11px] font-medium transition-all ${
              value === option.key
                ? 'bg-white text-navy-900 shadow-sm ring-1 ring-gray-100'
                : 'text-gray-400 hover:text-navy-900'
            }`}
          >
            {option.label}
            <span className="ml-1 tabular-nums text-gray-300">{count}</span>
          </button>
        );
      })}
    </div>
  );
}

function TripHeatmap({ points }) {
  const mapRef = useRef(null);
  const [viewState, setViewState] = useState({
    ...DEFAULT_MAP_VIEW,
    longitude: SALTA_CENTER.lng,
    latitude: SALTA_CENTER.lat,
    zoom: DEFAULT_ZOOM,
  });

  const heatmapGeoJSON = useMemo(() => buildHeatmapGeoJSON(points), [points]);
  const hasPoints = heatmapGeoJSON.features.length > 0;

  useEffect(() => {
    const map = mapRef.current?.getMap?.();
    if (!map || !hasPoints) return;

    const lngs = heatmapGeoJSON.features.map((feature) => feature.geometry.coordinates[0]);
    const lats = heatmapGeoJSON.features.map((feature) => feature.geometry.coordinates[1]);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);

    if (minLng === maxLng && minLat === maxLat) {
      map.easeTo({ center: [minLng, minLat], zoom: 14, duration: 400 });
      return;
    }

    map.fitBounds(
      [[minLng, minLat], [maxLng, maxLat]],
      { padding: 56, duration: 400, maxZoom: 15 },
    );
  }, [heatmapGeoJSON, hasPoints]);

  return (
    <div className="relative h-[320px] w-full overflow-hidden rounded-2xl">
      <Map
        ref={mapRef}
        {...viewState}
        onMove={(event) => setViewState(event.viewState)}
        mapStyle={MAP_STYLE_URL}
        mapContainerClassName="h-full w-full"
        style={{ width: '100%', height: '100%' }}
        {...mapLibreOptions}
      >
        {hasPoints ? (
          <Source id="trip-heatmap-source" type="geojson" data={heatmapGeoJSON}>
            <Layer {...HEATMAP_LAYER} />
          </Source>
        ) : null}
      </Map>
      {!hasPoints ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-white/55">
          <p className="text-[12px] text-gray-400">Sin puntos para el mapa de calor</p>
        </div>
      ) : null}
    </div>
  );
}

export default function StatisticsPanel({
  stats,
  loading,
  error,
  period,
  date,
  month,
  changePeriod,
  changeDate,
  changeMonth,
  lastUpdated,
  refetch,
  drivers = [],
}) {
  const [locationView, setLocationView] = useState('combined');
  const isDay = period === 'day';
  const isMonth = period === 'month';

  const fleetStats = useMemo(() => {
    const total = drivers.length;
    const online = drivers.filter((d) => d.isOnline && !d.activeTrip).length;
    const inTrip = drivers.filter((d) => d.activeTrip).length;
    const offline = drivers.filter((d) => !d.isOnline).length;
    return { total, online, inTrip, offline };
  }, [drivers]);

  const hourlyChartData = useMemo(() => {
    if (!stats?.hourlyDistribution) return [];
    return stats.hourlyDistribution.map((item) => ({
      hour: item.hour,
      count: item.count,
      label: formatHour(item.hour).replace(':00', 'h'),
    }));
  }, [stats]);

  const dailyChartData = useMemo(() => stats?.dailyTrend || [], [stats]);

  const weekdayChartData = useMemo(() => (
    (stats?.weekdayDistribution || []).map((item) => ({
      key: item.day,
      label: item.label,
      count: item.count,
    }))
  ), [stats]);

  const sourceItems = useMemo(() => {
    if (!stats?.bySource) return [];
    return Object.entries(stats.bySource)
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([key, count]) => ({
        key,
        count,
        label: SOURCE_LABELS[key] || key,
      }));
  }, [stats]);

  const statusItems = useMemo(() => {
    if (!stats?.byStatus) return [];
    return stats.byStatus.map((item) => ({
      key: item.status,
      count: item.count,
      label: STATUS_LABELS[item.status] || item.status,
    }));
  }, [stats]);

  const topDriverItems = useMemo(() => (
    (stats?.topDrivers || []).map((driver) => ({
      key: driver.id,
      label: driver.plate ? `${driver.name} · ${driver.plate}` : driver.name,
      count: driver.completed,
      trips: driver.trips,
      revenue: driver.revenue,
    }))
  ), [stats]);

  const cancelReasonItems = useMemo(() => stats?.cancelReasons || [], [stats]);

  const locationViews = stats?.locationViews || null;

  const activeLocationView = useMemo(() => {
    if (locationViews?.[locationView]) return locationViews[locationView];
    return {
      heatmapPoints: stats?.heatmapPoints || [],
      topZones: stats?.topZones || [],
      pointCount: (stats?.heatmapPoints || []).length,
      tripsWithPoint: 0,
      label: 'Combinado',
    };
  }, [locationViews, locationView, stats]);

  const topZoneItems = useMemo(() => (
    (activeLocationView.topZones || []).map((zone) => ({
      key: zone.key,
      label: zone.sampleAddress,
      count: zone.count,
    }))
  ), [activeLocationView.topZones]);

  const rangeTitle = useMemo(() => {
    if (isDay && date) {
      return new Date(`${date}T12:00:00`).toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    }
    if (isMonth && month) return formatMonthLabel(month);
    return stats?.label || 'Período seleccionado';
  }, [isDay, isMonth, date, month, stats]);

  if (loading && !stats) {
    return (
      <div className="flex h-full items-center justify-center bg-[#FAFBFC]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gray-200 border-t-navy-900" />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="flex h-full items-center justify-center bg-[#FAFBFC] p-6">
        <div className="text-center">
          <p className="mb-1 text-sm font-medium text-navy-900">Error al cargar</p>
          <p className="mb-4 text-[13px] text-gray-400">{error}</p>
          <button
            type="button"
            onClick={refetch}
            className="rounded-full bg-navy-900 px-4 py-2 text-[13px] font-medium text-white"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const summary = stats?.summary || {};

  return (
    <div className={`h-full overflow-x-hidden overflow-y-auto bg-[#FAFBFC] ${loading ? 'opacity-90' : ''}`}>
      <div className="mx-auto max-w-6xl space-y-5 px-5 py-6 pb-16">

        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-[28px] font-semibold tracking-tight text-navy-900">Estadística</h1>
            <p className="mt-1 text-[13px] capitalize text-gray-400">
              {rangeTitle}
              {lastUpdated
                ? ` · actualizado ${lastUpdated.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
                : ''}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-full bg-white p-0.5 shadow-sm ring-1 ring-gray-100">
              {QUICK_PERIODS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => changePeriod?.(option.key)}
                  className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-all ${
                    period === option.key
                      ? 'bg-navy-900 text-white'
                      : 'text-gray-400 hover:text-navy-900'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <label className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium shadow-sm ring-1 transition ${
              isDay ? 'bg-navy-900 text-white ring-navy-900' : 'bg-white text-gray-500 ring-gray-100'
            }`}>
              Día
              <input
                type="date"
                value={date || ''}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => changeDate?.(e.target.value)}
                className={`border-0 bg-transparent text-[12px] outline-none ${
                  isDay ? 'text-white [color-scheme:dark]' : 'text-navy-900'
                }`}
              />
            </label>

            <label className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium shadow-sm ring-1 transition ${
              isMonth ? 'bg-navy-900 text-white ring-navy-900' : 'bg-white text-gray-500 ring-gray-100'
            }`}>
              Mes
              <input
                type="month"
                value={month || ''}
                max={new Date().toISOString().slice(0, 7)}
                onChange={(e) => changeMonth?.(e.target.value)}
                className={`border-0 bg-transparent text-[12px] outline-none ${
                  isMonth ? 'text-white [color-scheme:dark]' : 'text-navy-900'
                }`}
              />
            </label>

            <button
              type="button"
              onClick={refetch}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-gray-400 ring-1 ring-gray-100 transition-colors hover:text-navy-900"
              title="Actualizar"
            >
              <svg className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="rounded-[20px] bg-white px-5 py-5">
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6 lg:gap-4 lg:divide-x lg:divide-gray-100">
            <div className="lg:pl-0"><Metric label="Viajes" value={summary.total ?? 0} detail={`${summary.avgTripsPerDay ?? 0}/día prom.`} /></div>
            <div className="lg:pl-4"><Metric label="Completados" value={summary.completed ?? 0} detail={`${summary.completionRate ?? 0}% del total`} /></div>
            <div className="lg:pl-4"><Metric label="Cancelados" value={summary.cancelled ?? 0} detail={`${summary.cancelRate ?? 0}% del total`} /></div>
            <div className="lg:pl-4"><Metric label="Facturación" value={formatPrice(summary.completedRevenue ?? summary.totalRevenue)} detail={`Ticket ${formatPrice(summary.avgCompletedPrice || summary.avgPrice)}`} /></div>
            <div className="lg:pl-4"><Metric label="Comisiones" value={formatPrice(summary.totalCommission)} detail={formatKm(summary.avgDistanceKm)} /></div>
            <div className="lg:pl-4">
              <Metric
                label="Flota"
                value={fleetStats.total}
                detail={`${fleetStats.online} libres · ${fleetStats.inTrip} viaje`}
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Tendencia diaria" hint="Cantidad de viajes por día (hora Argentina)">
            <AreaTrendChart data={dailyChartData} valueKey="count" color="#E11D48" />
          </Panel>

          <Panel title="Facturación diaria" hint="Solo viajes completados con precio">
            <AreaTrendChart data={dailyChartData} valueKey="revenue" color="#0F172A" />
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel
            title="Completados vs cancelados"
            hint="Comparación diaria"
            action={(
              <div className="flex items-center gap-3 text-[10px] text-gray-400">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Completados</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-400" /> Cancelados</span>
              </div>
            )}
          >
            <StackedDailyChart data={dailyChartData} />
          </Panel>

          <Panel title="Demanda por hora" hint="Distribución horaria (Argentina)">
            {hourlyChartData.some((d) => d.count > 0) ? (
              <ColumnChart data={hourlyChartData} labelKey="label" />
            ) : (
              <EmptyChart message="Sin actividad horaria" />
            )}
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Panel title="Por día de la semana" hint="Qué días piden más">
            {weekdayChartData.some((d) => d.count > 0) ? (
              <ColumnChart data={weekdayChartData} labelKey="label" color="bg-sky-600/85" />
            ) : (
              <EmptyChart />
            )}
          </Panel>

          <Panel title="Por canal" hint="Origen real del pedido">
            <DonutChart items={sourceItems} />
          </Panel>

          <Panel title="Por estado" hint="Composición del período">
            <DonutChart items={statusItems} />
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <Panel
            title="Mapa de calor"
            hint={
              locationView === 'pickup'
                ? 'Puntos de retiro del pasajero'
                : locationView === 'destination'
                  ? 'Destinos finales del viaje'
                  : 'Retiros y destinos juntos'
            }
            className="lg:col-span-3"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <LocationViewToggle
                value={locationView}
                onChange={setLocationView}
                views={locationViews}
              />
              <span className="text-[11px] tabular-nums text-gray-400">
                {activeLocationView.tripsWithPoint ?? activeLocationView.pointCount} viajes con ubicación
              </span>
            </div>
            <TripHeatmap points={activeLocationView.heatmapPoints || []} />
          </Panel>

          <Panel title="Top zonas" hint="Mayor demanda geográfica" className="lg:col-span-2">
            {topZoneItems.length === 0 ? (
              <EmptyChart message="Sin ubicaciones" />
            ) : (
              <HorizontalBars items={topZoneItems} />
            )}
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Panel title="Top choferes" hint="Por viajes completados en el período">
            {topDriverItems.length === 0 ? (
              <EmptyChart message="Sin choferes con viajes" />
            ) : (
              <HorizontalBars
                items={topDriverItems}
                valueFormatter={(item) => `${item.count} ok · ${formatPrice(item.revenue)}`}
              />
            )}
          </Panel>

          <Panel title="Motivos de cancelación" hint="Agrupados del período">
            {cancelReasonItems.length === 0 ? (
              <EmptyChart message="Sin cancelaciones" />
            ) : (
              <HorizontalBars items={cancelReasonItems} />
            )}
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Panel title="Rendimiento">
            <div className="space-y-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[12px] text-gray-500">Tasa de completado</span>
                <span className="text-[18px] font-semibold tabular-nums text-navy-900">{summary.completionRate ?? 0}%</span>
              </div>
              <div className="h-1 rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${summary.completionRate ?? 0}%` }} />
              </div>
              <div className="flex items-baseline justify-between pt-2">
                <span className="text-[12px] text-gray-500">Tasa de cancelación</span>
                <span className="text-[18px] font-semibold tabular-nums text-navy-900">{summary.cancelRate ?? 0}%</span>
              </div>
              <div className="h-1 rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-red-400" style={{ width: `${summary.cancelRate ?? 0}%` }} />
              </div>
            </div>
          </Panel>

          <Panel title="Promedios">
            <div className="space-y-5 pt-1">
              <div>
                <p className="mb-1 text-[11px] text-gray-400">Distancia</p>
                <p className="text-xl font-semibold text-navy-900">{formatKm(summary.avgDistanceKm)}</p>
              </div>
              <div>
                <p className="mb-1 text-[11px] text-gray-400">Duración</p>
                <p className="text-xl font-semibold text-navy-900">{formatDuration(summary.avgDurationMin)}</p>
              </div>
              <div>
                <p className="mb-1 text-[11px] text-gray-400">Hora pico</p>
                <p className="text-xl font-semibold text-navy-900">
                  {summary.peakHour != null ? formatHour(summary.peakHour) : '—'}
                  {summary.peakHourCount ? (
                    <span className="ml-2 text-sm font-normal text-gray-400">({summary.peakHourCount})</span>
                  ) : null}
                </p>
              </div>
            </div>
          </Panel>

          <Panel title="Flota en vivo">
            <div className="grid grid-cols-3 gap-3 pt-1">
              {[
                { label: 'Libres', value: fleetStats.online, color: 'text-emerald-600' },
                { label: 'En viaje', value: fleetStats.inTrip, color: 'text-navy-900' },
                { label: 'Offline', value: fleetStats.offline, color: 'text-gray-400' },
              ].map((item) => (
                <div key={item.label} className="text-center">
                  <p className={`text-2xl font-semibold tabular-nums ${item.color}`}>{item.value}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wide text-gray-400">{item.label}</p>
                </div>
              ))}
            </div>
            {summary.peakWeekdayLabel ? (
              <p className="mt-5 text-center text-[11px] text-gray-400">
                Día más fuerte: <span className="font-semibold text-navy-800">{summary.peakWeekdayLabel}</span>
                {' '}({summary.peakWeekdayCount})
              </p>
            ) : null}
          </Panel>
        </div>
      </div>
    </div>
  );
}
