'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import Map, { Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SALTA_CENTER, DEFAULT_ZOOM } from '../lib/constants';
import { MAP_STYLE_URL, DEFAULT_MAP_VIEW, mapLibreOptions } from '../lib/mapLibre';
import { formatPrice, formatKm, formatDuration } from '../lib/utils';
import {
  AreaTrendChart,
  ColumnChart,
  DonutChart,
  EmptyChart,
  HorizontalBars,
  StackedDailyChart,
} from './statistics/StatisticsCharts';


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

const SOURCE_ORDER = ['passenger_web', 'passenger_app', 'whatsapp', 'dashboard', 'otro'];

const SOURCE_META = {
  passenger_web: {
    label: 'Web pasajeros',
    color: '#0EA5E9',
    hint: 'profesionalviajes.com.ar/pasajero',
  },
  passenger_app: {
    label: 'App pasajeros',
    color: '#6366F1',
    hint: 'Aplicación móvil',
  },
  whatsapp: {
    label: 'WhatsApp',
    color: '#22C55E',
    hint: 'Agente y mensajes',
  },
  dashboard: {
    label: 'Panel',
    color: '#0F172A',
    hint: 'Carga operativa',
  },
  otro: {
    label: 'Otro',
    color: '#94A3B8',
    hint: 'Sin marcar',
  },
};

function formatHour(hour) {
  return `${String(hour).padStart(2, '0')}:00`;
}

function formatMonthLabel(monthStr) {
  if (!monthStr) return '';
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
}

function Panel({ title, hint, children, className = '', action = null }) {
  return (
    <section className={`rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-slate-200/70 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold tracking-tight text-navy-900">{title}</h3>
          {hint ? <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function MetricCard({ label, value, detail, accent = '#0F172A' }) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-[22px] bg-white p-4 shadow-sm ring-1 ring-slate-200/70">
      <span
        className="absolute inset-y-0 left-0 w-[3px]"
        style={{ backgroundColor: accent }}
      />
      <p className="mb-1.5 pl-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400">
        {label}
      </p>
      <p className="pl-2 text-[26px] font-semibold leading-none tracking-tight text-navy-900 tabular-nums">
        {value}
      </p>
      {detail ? <p className="mt-2 pl-2 text-[11px] text-slate-400">{detail}</p> : null}
    </div>
  );
}

function ChannelMix({ items, total }) {
  const safeTotal = total > 0 ? total : 0;
  return (
    <section className="rounded-[24px] bg-white p-5 shadow-sm ring-1 ring-slate-200/70">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="text-[13px] font-semibold tracking-tight text-navy-900">Canales de pedido</h3>
          <p className="mt-0.5 text-[11px] text-slate-400">
            Incluye la web de pasajeros · profesionalviajes.com.ar/pasajero
          </p>
        </div>
        <p className="text-[11px] tabular-nums text-slate-400">{safeTotal} viajes en el período</p>
      </div>

      <div className="mb-4 flex h-2.5 overflow-hidden rounded-full bg-slate-100">
        {items.filter((item) => item.count > 0).map((item) => (
          <span
            key={item.key}
            className="h-full"
            style={{
              width: `${Math.max(2, (item.count / Math.max(safeTotal, 1)) * 100)}%`,
              backgroundColor: item.color,
            }}
          />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((item) => {
          const percent = safeTotal > 0 ? Math.round((item.count / safeTotal) * 100) : 0;
          const isWeb = item.key === 'passenger_web';
          return (
            <div
              key={item.key}
              className={`rounded-2xl px-3 py-3 ring-1 ${
                isWeb
                  ? 'bg-sky-50/80 ring-sky-200/80'
                  : 'bg-slate-50/80 ring-slate-100'
              }`}
            >
              <div className="mb-2 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
                <p className="truncate text-[11px] font-medium text-navy-800">{item.label}</p>
              </div>
              <p className="text-[22px] font-semibold tabular-nums leading-none text-navy-900">
                {item.count}
              </p>
              <p className="mt-1.5 truncate text-[10px] text-slate-400">
                {percent}% · {item.hint}
              </p>
            </div>
          );
        })}
      </div>
    </section>
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
    const counts = stats?.bySource || {};
    return SOURCE_ORDER
      .map((key) => ({
        key,
        count: Number(counts[key]) || 0,
        label: SOURCE_META[key].label,
        color: SOURCE_META[key].color,
        hint: SOURCE_META[key].hint,
      }))
      .filter((item) => item.key !== 'otro' || item.count > 0);
  }, [stats]);

  const sourceDonutItems = useMemo(
    () => sourceItems.filter((item) => item.count > 0),
    [sourceItems],
  );

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
      <div className="flex h-full items-center justify-center bg-[#F3F5F8]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-navy-900" />
      </div>
    );
  }

  if (error && !stats) {
    return (
      <div className="flex h-full items-center justify-center bg-[#F3F5F8] p-6">
        <div className="text-center">
          <p className="mb-1 text-sm font-medium text-navy-900">Error al cargar</p>
          <p className="mb-4 text-[13px] text-slate-400">{error}</p>
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
    <div className={`h-full overflow-x-hidden overflow-y-auto bg-[#F3F5F8] ${loading ? 'opacity-90' : ''}`}>
      <div className="mx-auto max-w-6xl space-y-5 px-3 py-4 pb-16 sm:px-5 sm:py-6">

        <header className="relative overflow-hidden rounded-[28px] bg-navy-900 px-5 py-5 text-white shadow-lg shadow-navy-900/10 sm:px-6">
          <div className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-sky-400/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 left-1/3 h-48 w-48 rounded-full bg-indigo-400/10 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/45">Operaciones</p>
              <h1 className="mt-1 text-[30px] font-semibold tracking-tight">Estadística</h1>
              <p className="mt-1 text-[13px] capitalize text-white/55">
                {rangeTitle}
                {lastUpdated
                  ? ` · actualizado ${lastUpdated.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
                  : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-full bg-white/10 p-0.5 ring-1 ring-white/10">
                {QUICK_PERIODS.map((option) => (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => changePeriod?.(option.key)}
                    className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition-all ${
                      period === option.key
                        ? 'bg-white text-navy-900 shadow-sm'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>

              <label className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium ring-1 transition ${
                isDay ? 'bg-white text-navy-900 ring-white' : 'bg-white/10 text-white/70 ring-white/10'
              }`}>
                Día
                <input
                  type="date"
                  value={date || ''}
                  max={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => changeDate?.(e.target.value)}
                  className={`border-0 bg-transparent text-[12px] outline-none ${
                    isDay ? 'text-navy-900' : 'text-white [color-scheme:dark]'
                  }`}
                />
              </label>

              <label className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-medium ring-1 transition ${
                isMonth ? 'bg-white text-navy-900 ring-white' : 'bg-white/10 text-white/70 ring-white/10'
              }`}>
                Mes
                <input
                  type="month"
                  value={month || ''}
                  max={new Date().toISOString().slice(0, 7)}
                  onChange={(e) => changeMonth?.(e.target.value)}
                  className={`border-0 bg-transparent text-[12px] outline-none ${
                    isMonth ? 'text-navy-900' : 'text-white [color-scheme:dark]'
                  }`}
                />
              </label>

              <button
                type="button"
                onClick={refetch}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/70 ring-1 ring-white/10 transition-colors hover:bg-white/20 hover:text-white"
                title="Actualizar"
              >
                <svg className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              </button>
            </div>
          </div>
        </header>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <MetricCard label="Viajes" value={summary.total ?? 0} detail={`${summary.avgTripsPerDay ?? 0}/día prom.`} accent="#0F172A" />
          <MetricCard label="Completados" value={summary.completed ?? 0} detail={`${summary.completionRate ?? 0}% del total`} accent="#22C55E" />
          <MetricCard label="Cancelados" value={summary.cancelled ?? 0} detail={`${summary.cancelRate ?? 0}% del total`} accent="#FB7185" />
          <MetricCard label="Facturación" value={formatPrice(summary.completedRevenue ?? summary.totalRevenue)} detail={`Ticket ${formatPrice(summary.avgCompletedPrice || summary.avgPrice)}`} accent="#F59E0B" />
          <MetricCard label="Comisiones" value={formatPrice(summary.totalCommission)} detail={formatKm(summary.avgDistanceKm)} accent="#0EA5E9" />
          <MetricCard
            label="Flota"
            value={fleetStats.total}
            detail={`${fleetStats.online} libres · ${fleetStats.inTrip} viaje`}
            accent="#6366F1"
          />
        </div>

        <ChannelMix items={sourceItems} total={summary.total ?? 0} />

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel title="Tendencia diaria" hint="Cantidad de viajes por día (hora Argentina)">
            <AreaTrendChart data={dailyChartData} valueKey="count" color="#E11D48" valueLabel="Viajes" />
          </Panel>

          <Panel title="Facturación diaria" hint="Solo viajes completados con precio">
            <AreaTrendChart data={dailyChartData} valueKey="revenue" color="#0F172A" money valueLabel="Facturación" />
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Panel
            title="Completados vs cancelados"
            hint="Comparación diaria"
            action={(
              <div className="flex items-center gap-3 text-[10px] text-slate-400">
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-500" /> Completados</span>
                <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-400" /> Cancelados</span>
              </div>
            )}
          >
            <StackedDailyChart data={dailyChartData} />
          </Panel>

          <Panel title="Demanda por hora" hint="Distribución horaria (Argentina)">
            {hourlyChartData.some((d) => d.count > 0) ? (
              <ColumnChart data={hourlyChartData} labelKey="label" valueLabel="Viajes" />
            ) : (
              <EmptyChart message="Sin actividad horaria" />
            )}
          </Panel>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Panel title="Por día de la semana" hint="Qué días piden más">
            {weekdayChartData.some((d) => d.count > 0) ? (
              <ColumnChart data={weekdayChartData} labelKey="label" color="bg-sky-600/85" valueLabel="Viajes" />
            ) : (
              <EmptyChart />
            )}
          </Panel>

          <Panel title="Por canal" hint="Origen real del pedido">
            <DonutChart items={sourceDonutItems} />
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
