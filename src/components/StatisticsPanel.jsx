'use client';

import { useMemo, useState } from 'react';
import Map from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SALTA_CENTER, DEFAULT_ZOOM } from '../lib/constants';
import { MAP_STYLE_URL, DEFAULT_MAP_VIEW, mapLibreOptions } from '../lib/mapLibre';
import { createHeatmapCanvasOverlay } from '../lib/heatmapCanvasOverlay';
import { formatPrice, formatKm, formatDuration } from '../lib/utils';

const PERIOD_OPTIONS = [
  { key: '7d', label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
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
  accepted: 'Aceptado',
  going_to_pickup: 'En camino',
  in_progress: 'En curso',
  completed: 'Completado',
  cancelled: 'Cancelado',
};

const SOURCE_LABELS = {
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

function EmptyChart({ message = 'Sin datos' }) {
  return (
    <div className="h-[180px] flex items-center justify-center">
      <p className="text-[13px] text-gray-300">{message}</p>
    </div>
  );
}

function Panel({ title, hint, children, className = '' }) {
  return (
    <section className={`bg-white rounded-[20px] p-5 ${className}`}>
      <div className="mb-4">
        <h3 className="text-[13px] font-semibold text-navy-900 tracking-tight">{title}</h3>
        {hint && <p className="text-[11px] text-gray-400 mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function Metric({ label, value, detail }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-[0.12em] text-gray-400 mb-1">{label}</p>
      <p className="text-[22px] font-semibold text-navy-900 tabular-nums leading-none tracking-tight">{value}</p>
      {detail && <p className="text-[11px] text-gray-400 mt-1.5">{detail}</p>}
    </div>
  );
}

function AreaTrendChart({ data }) {
  if (!data?.length) return <EmptyChart message="Sin viajes en el período" />;

  const max = Math.max(...data.map((d) => d.count), 1);
  const pad = 8;
  const w = 100;
  const h = 100;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;

  const coords = data.map((item, index) => {
    const x = pad + (index / Math.max(data.length - 1, 1)) * innerW;
    const y = pad + innerH - (item.count / max) * innerH;
    return { x, y, ...item };
  });

  const line = coords.map((p) => `${p.x},${p.y}`).join(' ');
  const area = `${coords[0].x},${pad + innerH} ${line} ${coords[coords.length - 1].x},${pad + innerH}`;

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-[180px]" preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#E11D48" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#E11D48" stopOpacity="0" />
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
        <polygon points={area} fill="url(#areaFill)" />
        <polyline
          points={line}
          fill="none"
          stroke="#E11D48"
          strokeWidth="1.2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {coords.map((point) => (
          <circle key={point.date} cx={point.x} cy={point.y} r="1.2" fill="#E11D48" />
        ))}
      </svg>
      <div className="flex justify-between mt-2 px-0.5">
        {data.length <= 6
          ? data.map((item) => (
            <span key={item.date} className="text-[10px] text-gray-400">{formatDayShort(item.date)}</span>
          ))
          : [data[0], data[Math.floor(data.length / 2)], data[data.length - 1]].map((item) => (
            <span key={item.date} className="text-[10px] text-gray-400">{formatDayShort(item.date)}</span>
          ))}
      </div>
    </div>
  );
}

function ColumnChart({ data, labelKey = 'label' }) {
  if (!data?.length) return <EmptyChart />;

  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="h-[180px] flex items-end gap-[3px]">
      {data.map((item, index) => {
        const height = Math.max(6, Math.round((item.count / max) * 100));
        return (
          <div key={item.key ?? item.hour ?? item.label ?? index} className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
            <span className="text-[9px] text-gray-400 tabular-nums">{item.count}</span>
            <div className="w-full flex items-end justify-center" style={{ height: '120px' }}>
              <div
                className="w-full max-w-[14px] rounded-t-md bg-navy-900/85 transition-all duration-500"
                style={{ height: `${height}%` }}
              />
            </div>
            <span className="text-[9px] text-gray-400 truncate w-full text-center">{item[labelKey]}</span>
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
        <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
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
          <span className="text-lg font-semibold text-navy-900 tabular-nums">{total}</span>
          <span className="text-[9px] text-gray-400 uppercase tracking-wider">total</span>
        </div>
      </div>
      <div className="flex-1 space-y-2 min-w-0">
        {items.map((item, index) => (
          <div key={item.key} className="flex items-center gap-2 min-w-0">
            <span
              className="w-2 h-2 rounded-full flex-shrink-0"
              style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
            />
            <span className="text-[11px] text-gray-500 truncate flex-1">{item.label}</span>
            <span className="text-[11px] font-medium text-navy-900 tabular-nums">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function HorizontalBars({ items, maxBars = 8 }) {
  if (!items?.length) return <EmptyChart />;

  const slice = items.slice(0, maxBars);
  const max = Math.max(...slice.map((d) => d.count), 1);

  return (
    <div className="space-y-3">
      {slice.map((item, index) => (
        <div key={item.key ?? item.label ?? index}>
          <div className="flex items-center justify-between gap-3 mb-1.5">
            <span className="text-[11px] text-gray-600 truncate">{item.label}</span>
            <span className="text-[11px] font-medium text-navy-900 tabular-nums">{item.count}</span>
          </div>
          <div className="h-1 rounded-full bg-gray-100 overflow-hidden">
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
            className={`px-3 py-1.5 rounded-full text-[11px] font-medium transition-all ${
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
  const [viewState, setViewState] = useState({
    ...DEFAULT_MAP_VIEW,
    longitude: SALTA_CENTER.lng,
    latitude: SALTA_CENTER.lat,
    zoom: DEFAULT_ZOOM,
  });

  return (
    <Map
      {...viewState}
      onMove={(event) => setViewState(event.viewState)}
      mapStyle={MAP_STYLE_URL}
      mapContainerClassName="h-[320px] w-full rounded-2xl overflow-hidden"
      style={{ width: '100%', height: '320px' }}
      {...mapLibreOptions}
    />
  );
}

export default function StatisticsPanel({
  stats,
  loading,
  error,
  period,
  changePeriod,
  lastUpdated,
  refetch,
  drivers = [],
}) {
  const [locationView, setLocationView] = useState('combined');

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
    (activeLocationView.topZones || []).map((zone, index) => ({
      key: zone.key,
      label: zone.sampleAddress,
      count: zone.count,
      rank: index + 1,
    }))
  ), [activeLocationView.topZones]);

  if (loading && !stats) {
    return (
      <div className="h-full flex items-center justify-center bg-[#FAFBFC]">
        <div className="w-8 h-8 border-2 border-gray-200 border-t-navy-900 rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="h-full flex items-center justify-center bg-[#FAFBFC] p-6">
        <div className="text-center">
          <p className="text-sm font-medium text-navy-900 mb-1">Error al cargar</p>
          <p className="text-[13px] text-gray-400 mb-4">{error}</p>
          <button
            type="button"
            onClick={refetch}
            className="px-4 py-2 rounded-full bg-navy-900 text-white text-[13px] font-medium"
          >
            Reintentar
          </button>
        </div>
      </div>
    );
  }

  const summary = stats?.summary || {};

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden bg-[#FAFBFC]">
      <div className="max-w-6xl mx-auto px-5 py-6 pb-16 space-y-6">

        {/* Header minimalista */}
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-semibold text-navy-900 tracking-tight">Estadística</h1>
            <p className="text-[13px] text-gray-400 mt-1">
              {lastUpdated
                ? `Actualizado ${lastUpdated.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
                : 'Métricas operativas'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="inline-flex rounded-full bg-white p-0.5 shadow-sm ring-1 ring-gray-100">
              {PERIOD_OPTIONS.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => changePeriod(option.key)}
                  className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium transition-all ${
                    period === option.key
                      ? 'bg-navy-900 text-white'
                      : 'text-gray-400 hover:text-navy-900'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={refetch}
              className="w-8 h-8 rounded-full bg-white ring-1 ring-gray-100 text-gray-400 hover:text-navy-900 transition-colors flex items-center justify-center"
              title="Actualizar"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </div>
        </header>

        {/* KPIs en fila única */}
        <div className="bg-white rounded-[20px] px-5 py-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-6 lg:gap-4 lg:divide-x lg:divide-gray-100">
            <Metric label="Viajes" value={summary.total ?? 0} detail={`${summary.completionRate ?? 0}% completados`} />
            <Metric label="Completados" value={summary.completed ?? 0} detail={`${summary.cancelled ?? 0} cancelados`} />
            <Metric label="Activos" value={summary.active ?? 0} detail="En curso ahora" />
            <Metric label="Facturación" value={formatPrice(summary.totalRevenue)} detail={`Prom. ${formatPrice(summary.avgPrice)}`} />
            <Metric label="Comisiones" value={formatPrice(summary.totalCommission)} detail={formatKm(summary.avgDistanceKm)} />
            <Metric
              label="Flota"
              value={fleetStats.total}
              detail={`${fleetStats.online} libres · ${fleetStats.inTrip} viaje`}
            />
          </div>
        </div>

        {/* Gráficas principales */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Panel title="Tendencia diaria" hint="Viajes por día en el período">
            <AreaTrendChart data={dailyChartData} />
          </Panel>

          <Panel title="Demanda por hora" hint="Distribución horaria de pedidos">
            {hourlyChartData.some((d) => d.count > 0) ? (
              <ColumnChart data={hourlyChartData} labelKey="label" />
            ) : (
              <EmptyChart message="Sin actividad horaria" />
            )}
          </Panel>
        </div>

        {/* Mapa + zonas */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
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
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <LocationViewToggle
                value={locationView}
                onChange={setLocationView}
                views={locationViews}
              />
              <span className="text-[11px] text-gray-400 tabular-nums">
                {activeLocationView.tripsWithPoint ?? activeLocationView.pointCount} viajes con ubicación
              </span>
            </div>
            <TripHeatmap points={activeLocationView.heatmapPoints || []} />
            <div className="flex items-center gap-3 mt-3">
              <span className="text-[10px] text-gray-300">Baja</span>
              <div className="flex-1 h-1 rounded-full bg-gradient-to-r from-blue-200 via-amber-200 to-red-500" />
              <span className="text-[10px] text-gray-300">Alta</span>
              <span className="text-[10px] text-gray-400 tabular-nums">
                {activeLocationView.pointCount} pts
              </span>
            </div>
          </Panel>

          <Panel
            title="Top zonas"
            hint={
              locationView === 'pickup'
                ? 'Mayor demanda de retiro'
                : locationView === 'destination'
                  ? 'Destinos más frecuentes'
                  : 'Retiros y destinos'
            }
            className="lg:col-span-2"
          >
            {topZoneItems.length === 0 ? (
              <EmptyChart message="Sin ubicaciones" />
            ) : (
              <HorizontalBars items={topZoneItems} />
            )}
          </Panel>
        </div>

        {/* Distribuciones */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Panel title="Por estado" hint="Composición del período">
            <DonutChart items={statusItems} />
          </Panel>

          <Panel title="Por canal" hint="WhatsApp vs dashboard">
            <DonutChart items={sourceItems} />
          </Panel>
        </div>

        {/* Detalle operativo */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Panel title="Rendimiento">
            <div className="space-y-4">
              <div className="flex justify-between items-baseline">
                <span className="text-[12px] text-gray-500">Tasa de completado</span>
                <span className="text-[18px] font-semibold text-navy-900 tabular-nums">{summary.completionRate ?? 0}%</span>
              </div>
              <div className="h-1 rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${summary.completionRate ?? 0}%` }} />
              </div>
              <div className="flex justify-between items-baseline pt-2">
                <span className="text-[12px] text-gray-500">Tasa de cancelación</span>
                <span className="text-[18px] font-semibold text-navy-900 tabular-nums">{summary.cancelRate ?? 0}%</span>
              </div>
              <div className="h-1 rounded-full bg-gray-100">
                <div className="h-full rounded-full bg-red-400" style={{ width: `${summary.cancelRate ?? 0}%` }} />
              </div>
            </div>
          </Panel>

          <Panel title="Promedios">
            <div className="space-y-5 pt-1">
              <div>
                <p className="text-[11px] text-gray-400 mb-1">Distancia</p>
                <p className="text-xl font-semibold text-navy-900">{formatKm(summary.avgDistanceKm)}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-400 mb-1">Duración</p>
                <p className="text-xl font-semibold text-navy-900">{formatDuration(summary.avgDurationMin)}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-400 mb-1">Hora pico</p>
                <p className="text-xl font-semibold text-navy-900">
                  {summary.peakHour != null ? formatHour(summary.peakHour) : '—'}
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
                  <p className="text-[10px] text-gray-400 mt-1 uppercase tracking-wide">{item.label}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
