'use client';

import { useState, useCallback, useRef, useMemo } from 'react';
import Map, { Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { SALTA_CENTER } from '../lib/constants';
import { MAP_STYLE_URL, DEFAULT_MAP_VIEW, mapLibreOptions } from '../lib/mapLibre';
import { useServiceZones } from '../hooks/useServiceZones';
import { useToast } from '../context/ToastContext';

const ZONE_COLORS = [
  '#DC2626',
  '#2563EB',
  '#16A34A',
  '#D97706',
  '#7C3AED',
  '#0891B2',
  '#DB2777',
  '#65A30D',
];

export default function ZoneManagement({ onBack }) {
  const toast = useToast();
  const { zones, loading, createZone, deleteZone, toggleZoneActive } = useServiceZones();

  const [isDrawing, setIsDrawing] = useState(false);
  const [draftCoords, setDraftCoords] = useState([]);
  const [pendingCoords, setPendingCoords] = useState(null);
  const [showNameModal, setShowNameModal] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const [pendingColor, setPendingColor] = useState(ZONE_COLORS[0]);
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');
  const [viewState, setViewState] = useState({
    ...DEFAULT_MAP_VIEW,
    longitude: SALTA_CENTER.lng,
    latitude: SALTA_CENTER.lat,
    zoom: 13,
  });

  const mapRef = useRef(null);
  const nameInputRef = useRef(null);

  const onMapLoad = useCallback((event) => {
    mapRef.current = event.target;
  }, []);

  const finishDrawing = useCallback(() => {
    if (draftCoords.length < 3) {
      setError('El polígono debe tener al menos 3 puntos');
      return;
    }
    setIsDrawing(false);
    setPendingCoords(draftCoords);
    setDraftCoords([]);
    setPendingName('');
    setPendingColor(ZONE_COLORS[0]);
    setShowNameModal(true);
    setError('');
    setTimeout(() => nameInputRef.current?.focus(), 100);
  }, [draftCoords]);

  const handleMapClick = useCallback((event) => {
    if (!isDrawing) return;
    const { lng, lat } = event.lngLat;
    setDraftCoords((prev) => [...prev, { lat, lng }]);
  }, [isDrawing]);

  const handleStartDrawing = () => {
    setIsDrawing(true);
    setDraftCoords([]);
    setSelectedZoneId(null);
    setError('');
  };

  const handleCancelDrawing = () => {
    setIsDrawing(false);
    setDraftCoords([]);
    setPendingCoords(null);
    setShowNameModal(false);
    setError('');
  };

  const handleSaveZone = async () => {
    if (!pendingName.trim()) {
      setError('El nombre es obligatorio');
      nameInputRef.current?.focus();
      return;
    }
    if (!pendingCoords || pendingCoords.length < 3) {
      setError('El polígono debe tener al menos 3 puntos');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await createZone({
        name: pendingName.trim(),
        color: pendingColor,
        coordinates: pendingCoords,
      });
      setShowNameModal(false);
      setPendingCoords(null);
      setPendingName('');
      toast.success(`Zona "${pendingName.trim()}" creada`);
    } catch (err) {
      const message = err.message || 'Error al guardar la zona';
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    setDeletingId(confirmDelete.id);
    setError('');
    try {
      await deleteZone(confirmDelete.id);
      if (selectedZoneId === confirmDelete.id) setSelectedZoneId(null);
      setConfirmDelete(null);
      toast.success(`Zona "${confirmDelete.name}" eliminada`);
    } catch (err) {
      const message = err.message || 'Error al eliminar la zona';
      setError(message);
      toast.error(message);
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (zone, e) => {
    e.stopPropagation();
    try {
      await toggleZoneActive(zone.id, !zone.is_active);
      toast.success(zone.is_active ? `Zona "${zone.name}" desactivada` : `Zona "${zone.name}" activada`);
    } catch (err) {
      const message = err.message || 'Error al actualizar la zona';
      setError(message);
      toast.error(message);
    }
  };

  const handleDeleteClick = (zone, e) => {
    e.stopPropagation();
    setConfirmDelete(zone);
    setError('');
  };

  const activeCount = zones.filter((z) => z.is_active).length;

  const zonesGeoJson = useMemo(() => ({
    type: 'FeatureCollection',
    features: zones
      .map((zone) => {
        const coords = Array.isArray(zone.coordinates) ? zone.coordinates : [];
        if (coords.length < 3) return null;
        const ring = coords.map((c) => [Number(c.lng), Number(c.lat)]);
        if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
          ring.push(ring[0]);
        }
        return {
          type: 'Feature',
          properties: {
            id: zone.id,
            color: zone.color,
            isActive: zone.is_active,
            isSelected: selectedZoneId === zone.id,
          },
          geometry: { type: 'Polygon', coordinates: [ring] },
        };
      })
      .filter(Boolean),
  }), [zones, selectedZoneId]);

  const draftGeoJson = useMemo(() => {
    if (draftCoords.length < 2) return null;
    const ring = draftCoords.map((c) => [c.lng, c.lat]);
    if (draftCoords.length >= 3) ring.push(ring[0]);
    return {
      type: 'Feature',
      geometry: {
        type: draftCoords.length >= 3 ? 'Polygon' : 'LineString',
        coordinates: draftCoords.length >= 3 ? [ring] : ring,
      },
      properties: {},
    };
  }, [draftCoords]);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-light-300/50 bg-light-50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-8 h-8 rounded-xl bg-light-200 border border-light-300/50 flex items-center justify-center text-gray-500 hover:text-navy-900 hover:bg-light-300/50 transition-all"
            title="Volver al mapa"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-navy-900 font-bold text-base leading-tight">Zonas de servicio</h1>
            <p className="text-gray-500 text-xs">
              {loading
                ? 'Cargando...'
                : zones.length === 0
                ? 'Sin zonas — todos los pedidos son aceptados'
                : `${activeCount} zona${activeCount !== 1 ? 's' : ''} activa${activeCount !== 1 ? 's' : ''} de ${zones.length} total`}
            </p>
          </div>
        </div>

        <button
          onClick={handleStartDrawing}
          disabled={isDrawing || !isLoaded}
          className="flex items-center gap-2 bg-accent text-white text-sm font-semibold px-4 py-2.5 rounded-xl hover:bg-accent-light transition-all shadow-md shadow-accent/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
          </svg>
          Nueva zona
        </button>
      </div>

      {/* ── Body: panel izquierdo + mapa ───────────────────────── */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Panel izquierdo */}
        <aside className="w-72 flex-shrink-0 border-r border-light-300/50 flex flex-col bg-light-50 overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : zones.length === 0 ? (
            <EmptyState />
          ) : (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {zones.map((zone) => (
                <ZoneCard
                  key={zone.id}
                  zone={zone}
                  isSelected={selectedZoneId === zone.id}
                  isDeleting={deletingId === zone.id}
                  onSelect={() =>
                    setSelectedZoneId(selectedZoneId === zone.id ? null : zone.id)
                  }
                  onToggle={(e) => handleToggleActive(zone, e)}
                  onDelete={(e) => handleDeleteClick(zone, e)}
                />
              ))}
            </div>
          )}

          {/* Footer de estado */}
          {zones.length > 0 && !loading && (
            <div className="p-3 border-t border-light-300/50 flex-shrink-0">
              {activeCount === 0 ? (
                <StatusBanner variant="warning">
                  Todas las zonas están inactivas. Los pedidos no serán filtrados por ubicación.
                </StatusBanner>
              ) : (
                <StatusBanner variant="success">
                  {activeCount} zona{activeCount !== 1 ? 's' : ''} activa{activeCount !== 1 ? 's' : ''}. Pedidos fuera de estas zonas serán rechazados.
                </StatusBanner>
              )}
            </div>
          )}
        </aside>

        {/* Área del mapa */}
        <div className="flex-1 relative overflow-hidden">
          {/* Banner de modo dibujo */}
          {isDrawing && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 bg-navy-900/90 backdrop-blur-sm text-white rounded-2xl px-5 py-3 shadow-xl pointer-events-none">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse flex-shrink-0" />
              <span className="text-sm font-semibold whitespace-nowrap">Modo dibujo activo</span>
              <span className="text-xs text-white/60 hidden sm:inline whitespace-nowrap">
                Hacé clic en el mapa para agregar vértices ({draftCoords.length} puntos)
              </span>
              <button
                type="button"
                onClick={finishDrawing}
                disabled={draftCoords.length < 3}
                className="pointer-events-auto ml-1 text-xs text-white border border-white/25 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-40"
              >
                Terminar
              </button>
              <button
                onClick={handleCancelDrawing}
                className="pointer-events-auto ml-1 text-xs text-white/70 hover:text-white border border-white/25 rounded-lg px-2.5 py-1 transition-colors"
              >
                Cancelar
              </button>
            </div>
          )}

          <Map
            {...viewState}
            onMove={(event) => setViewState(event.viewState)}
            mapStyle={MAP_STYLE_URL}
            style={{ width: '100%', height: '100%' }}
            onLoad={onMapLoad}
            onClick={handleMapClick}
            {...mapLibreOptions}
          >
            <Source id="zones" type="geojson" data={zonesGeoJson}>
              <Layer
                id="zones-fill"
                type="fill"
                paint={{
                  'fill-color': ['get', 'color'],
                  'fill-opacity': [
                    'case',
                    ['get', 'isSelected'], 0.35,
                    ['get', 'isActive'], 0.18,
                    0.06,
                  ],
                }}
              />
              <Layer
                id="zones-line"
                type="line"
                paint={{
                  'line-color': ['get', 'color'],
                  'line-width': ['case', ['get', 'isSelected'], 3, 2],
                  'line-opacity': ['case', ['get', 'isActive'], 1, 0.35],
                }}
              />
            </Source>
            {draftGeoJson ? (
              <Source id="draft-zone" type="geojson" data={draftGeoJson}>
                <Layer
                  id="draft-fill"
                  type="fill"
                  paint={{ 'fill-color': pendingColor, 'fill-opacity': 0.25 }}
                />
                <Layer
                  id="draft-line"
                  type="line"
                  paint={{ 'line-color': pendingColor, 'line-width': 2.5 }}
                />
              </Source>
            ) : null}
          </Map>

          {/* Leyenda cuando hay zonas */}
          {zones.length > 0 && (
            <div className="absolute bottom-4 right-4 bg-light-50/92 backdrop-blur-xl border border-light-300/50 rounded-xl p-3 shadow-lg space-y-1.5 max-w-[180px]">
              {zones.map((zone) => (
                <div key={zone.id} className="flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0 ring-1 ring-white/80"
                    style={{ backgroundColor: zone.color, opacity: zone.is_active ? 1 : 0.4 }}
                  />
                  <span
                    className="text-xs truncate"
                    style={{ color: zone.is_active ? '#0F172A' : '#94A3B8' }}
                  >
                    {zone.name}
                  </span>
                  {!zone.is_active && (
                    <span className="text-[10px] text-gray-400 flex-shrink-0">(inactiva)</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Modal: nombrar nueva zona ───────────────────────────── */}
      {showNameModal && (
        <Modal>
          <div className="p-6">
            <h2 className="text-navy-900 font-bold text-base mb-1">Guardar zona de servicio</h2>
            <p className="text-gray-500 text-xs mb-5">
              Asigná un nombre y un color identificador a la nueva zona.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-navy-800 mb-1.5">
                  Nombre de la zona
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  value={pendingName}
                  onChange={(e) => setPendingName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveZone(); }}
                  placeholder="Ej: Centro, Tres Cerritos, Portezuelo..."
                  maxLength={60}
                  className="w-full bg-light-200 border border-light-300/50 rounded-xl px-3 py-2.5 text-sm text-navy-900 placeholder-gray-400 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-navy-800 mb-2">Color</label>
                <div className="flex gap-2 flex-wrap">
                  {ZONE_COLORS.map((color) => (
                    <button
                      key={color}
                      onClick={() => setPendingColor(color)}
                      className={`w-8 h-8 rounded-full border-2 transition-all ${
                        pendingColor === color
                          ? 'border-navy-900 scale-110 shadow-md'
                          : 'border-light-300 hover:border-light-500'
                      }`}
                      style={{ backgroundColor: color }}
                      title={color}
                    />
                  ))}
                </div>
              </div>

              {error && <p className="text-danger text-xs font-medium">{error}</p>}
            </div>
          </div>

          <div className="flex gap-2 px-6 pb-5">
            <button
              onClick={handleCancelDrawing}
              className="flex-1 py-2.5 rounded-xl border border-light-300/50 text-sm font-semibold text-gray-500 hover:bg-light-200 transition-all"
            >
              Cancelar
            </button>
            <button
              onClick={handleSaveZone}
              disabled={saving || !pendingName.trim()}
              className="flex-1 py-2.5 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-light disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-accent/20"
            >
              {saving ? 'Guardando...' : 'Guardar zona'}
            </button>
          </div>
        </Modal>
      )}

      {/* ── Modal: confirmar eliminación ────────────────────────── */}
      {confirmDelete && (
        <Modal>
          <div className="p-6">
            <div className="w-10 h-10 rounded-2xl bg-danger/10 flex items-center justify-center mb-4">
              <svg className="w-5 h-5 text-danger" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-navy-900 font-bold text-base mb-2">¿Eliminar zona?</h2>
            <p className="text-gray-500 text-sm mb-5">
              Se eliminará permanentemente la zona{' '}
              <strong className="text-navy-900">&ldquo;{confirmDelete.name}&rdquo;</strong>.
              Esta acción no se puede deshacer.
            </p>
            {error && <p className="text-danger text-xs mb-3 font-medium">{error}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => { setConfirmDelete(null); setError(''); }}
                disabled={!!deletingId}
                className="flex-1 py-2.5 rounded-xl border border-light-300/50 text-sm font-semibold text-gray-500 hover:bg-light-200 disabled:opacity-50 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={!!deletingId}
                className="flex-1 py-2.5 rounded-xl bg-danger text-white text-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition-all"
              >
                {deletingId ? 'Eliminando...' : 'Eliminar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Sub-componentes ────────────────────────────────────────────

function ZoneCard({ zone, isSelected, isDeleting, onSelect, onToggle, onDelete }) {
  const coordCount = Array.isArray(zone.coordinates) ? zone.coordinates.length : 0;

  return (
    <div
      onClick={onSelect}
      className={`rounded-xl border cursor-pointer transition-all ${
        isSelected
          ? 'border-navy-700/25 bg-navy-dim shadow-sm'
          : 'border-light-300/50 bg-white hover:border-light-400'
      }`}
    >
      <div className="flex items-center gap-3 p-3">
        {/* Indicador de color */}
        <div
          className="w-3.5 h-3.5 rounded-full flex-shrink-0 ring-2 ring-white shadow-sm"
          style={{ backgroundColor: zone.color, opacity: zone.is_active ? 1 : 0.4 }}
        />

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-semibold truncate ${
              zone.is_active ? 'text-navy-900' : 'text-gray-400'
            }`}
          >
            {zone.name}
          </p>
          <p className="text-gray-400 text-xs">
            {coordCount} vértice{coordCount !== 1 ? 's' : ''} ·{' '}
            {zone.is_active ? (
              <span className="text-online font-medium">Activa</span>
            ) : (
              <span className="text-gray-400">Inactiva</span>
            )}
          </p>
        </div>

        {/* Acciones */}
        <div
          className="flex items-center gap-1 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Toggle activo/inactivo */}
          <button
            onClick={onToggle}
            title={zone.is_active ? 'Desactivar zona' : 'Activar zona'}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
              zone.is_active
                ? 'bg-online-dim text-online hover:bg-online/20'
                : 'bg-light-200 text-gray-400 hover:bg-light-300/50'
            }`}
          >
            {zone.is_active ? (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
              </svg>
            )}
          </button>

          {/* Eliminar */}
          <button
            onClick={onDelete}
            disabled={isDeleting}
            title="Eliminar zona"
            className="w-7 h-7 rounded-lg bg-light-200 flex items-center justify-center text-gray-400 hover:text-danger hover:bg-danger/10 transition-all disabled:opacity-50"
          >
            {isDeleting ? (
              <div className="w-3 h-3 border border-danger border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-14 h-14 rounded-2xl bg-light-200 flex items-center justify-center mb-4">
        <svg className="w-7 h-7 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"
          />
        </svg>
      </div>
      <p className="text-navy-900 font-semibold text-sm mb-2">Sin zonas configuradas</p>
      <p className="text-gray-500 text-xs leading-relaxed">
        Sin zonas, todos los pedidos son aceptados. Hacé clic en{' '}
        <strong>Nueva zona</strong> y dibujá los polígonos para delimitar el área de cobertura.
      </p>
    </div>
  );
}

function StatusBanner({ variant, children }) {
  const styles = {
    warning: 'bg-warning/10 border-warning/25 text-warning',
    success: 'bg-online-dim border-online/25 text-online',
  };
  const icons = {
    warning: '⚠️',
    success: '✓',
  };
  return (
    <div className={`rounded-xl border p-3 text-xs leading-relaxed ${styles[variant]}`}>
      <span className="mr-1">{icons[variant]}</span>
      {children}
    </div>
  );
}

function Modal({ children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy-900/50 backdrop-blur-sm p-4">
      <div className="bg-light-50 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        {children}
      </div>
    </div>
  );
}
