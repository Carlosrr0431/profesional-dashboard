'use client';

import { useState, useCallback, useRef } from 'react';
import { GoogleMap, useJsApiLoader, Polygon, DrawingManager } from '@react-google-maps/api';
import { SALTA_CENTER, LIGHT_MAP_STYLE } from '../lib/constants';
import { useServiceZones } from '../hooks/useServiceZones';

// La biblioteca 'drawing' es necesaria para el DrawingManager.
// Debe definirse fuera del componente para evitar re-renderizados innecesarios.
const LIBRARIES = ['places', 'drawing'];

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

const MAP_CONTAINER_STYLE = { width: '100%', height: '100%' };

const MAP_OPTIONS = {
  styles: LIGHT_MAP_STYLE,
  disableDefaultUI: true,
  zoomControl: true,
  zoomControlOptions: { position: 9 /* RIGHT_CENTER */ },
  fullscreenControl: false,
  streetViewControl: false,
  mapTypeControl: false,
  clickableIcons: false,
  gestureHandling: 'greedy',
};

export default function ZoneManagement({ onBack }) {
  const { zones, loading, createZone, deleteZone, toggleZoneActive } = useServiceZones();

  // Estado de dibujo
  const [isDrawing, setIsDrawing] = useState(false);
  const [pendingCoords, setPendingCoords] = useState(null);
  const [showNameModal, setShowNameModal] = useState(false);
  const [pendingName, setPendingName] = useState('');
  const [pendingColor, setPendingColor] = useState(ZONE_COLORS[0]);

  // Estado de UI
  const [selectedZoneId, setSelectedZoneId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [error, setError] = useState('');

  const mapRef = useRef(null);
  const nameInputRef = useRef(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries: LIBRARIES,
  });

  const onMapLoad = useCallback((map) => {
    mapRef.current = map;
  }, []);

  // DrawingManager: el usuario termina de dibujar un polígono
  const onPolygonComplete = useCallback((polygon) => {
    const path = polygon.getPath();
    const coords = [];
    for (let i = 0; i < path.getLength(); i++) {
      const ll = path.getAt(i);
      coords.push({ lat: ll.lat(), lng: ll.lng() });
    }
    // Removemos el polígono temporal (se renderizará el permanente desde el estado)
    polygon.setMap(null);
    setIsDrawing(false);
    setPendingCoords(coords);
    setPendingName('');
    setPendingColor(ZONE_COLORS[0]);
    setShowNameModal(true);
    setError('');
    setTimeout(() => nameInputRef.current?.focus(), 100);
  }, []);

  const handleStartDrawing = () => {
    setIsDrawing(true);
    setSelectedZoneId(null);
    setError('');
  };

  const handleCancelDrawing = () => {
    setIsDrawing(false);
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
    } catch (err) {
      setError(err.message || 'Error al guardar la zona');
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
    } catch (err) {
      setError(err.message || 'Error al eliminar la zona');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (zone, e) => {
    e.stopPropagation();
    try {
      await toggleZoneActive(zone.id, !zone.is_active);
    } catch (err) {
      setError(err.message || 'Error al actualizar la zona');
    }
  };

  const handleDeleteClick = (zone, e) => {
    e.stopPropagation();
    setConfirmDelete(zone);
    setError('');
  };

  const activeCount = zones.filter((z) => z.is_active).length;

  if (!apiKey) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="bg-warning/10 border border-warning/30 rounded-2xl p-6 max-w-sm text-center">
          <p className="text-warning font-semibold text-sm mb-1">Falta la clave de Google Maps</p>
          <p className="text-gray-500 text-xs">
            Configurá <code className="bg-light-200 px-1 rounded">NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</code> en las variables de entorno.
          </p>
        </div>
      </div>
    );
  }

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
                Hacé clic en el mapa para definir los vértices del polígono
              </span>
              <button
                onClick={handleCancelDrawing}
                className="pointer-events-auto ml-1 text-xs text-white/70 hover:text-white border border-white/25 rounded-lg px-2.5 py-1 transition-colors"
              >
                Cancelar
              </button>
            </div>
          )}

          {/* Google Map */}
          {!isLoaded ? (
            <div className="flex h-full items-center justify-center">
              <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : loadError ? (
            <div className="flex h-full items-center justify-center p-6">
              <p className="text-danger text-sm text-center">
                Error al cargar Google Maps. Verificá la clave de API.
              </p>
            </div>
          ) : (
            <GoogleMap
              mapContainerStyle={MAP_CONTAINER_STYLE}
              center={SALTA_CENTER}
              zoom={13}
              options={MAP_OPTIONS}
              onLoad={onMapLoad}
            >
              {/* DrawingManager solo cuando está activo el modo dibujo */}
              {isDrawing && (
                <DrawingManager
                  drawingMode="polygon"
                  options={{
                    drawingControl: false,
                    polygonOptions: {
                      fillColor: pendingColor,
                      fillOpacity: 0.3,
                      strokeColor: pendingColor,
                      strokeWeight: 2.5,
                      clickable: false,
                      editable: false,
                      zIndex: 100,
                    },
                  }}
                  onPolygonComplete={onPolygonComplete}
                />
              )}

              {/* Polígonos de zonas guardadas */}
              {zones.map((zone) => {
                const coords = Array.isArray(zone.coordinates) ? zone.coordinates : [];
                if (coords.length < 3) return null;
                const isSelected = selectedZoneId === zone.id;
                return (
                  <Polygon
                    key={zone.id}
                    paths={coords}
                    options={{
                      fillColor: zone.color,
                      fillOpacity: zone.is_active ? (isSelected ? 0.35 : 0.18) : 0.06,
                      strokeColor: zone.color,
                      strokeWeight: isSelected ? 3 : 2,
                      strokeOpacity: zone.is_active ? 1 : 0.35,
                      clickable: true,
                      zIndex: isSelected ? 10 : 1,
                    }}
                    onClick={() =>
                      setSelectedZoneId(selectedZoneId === zone.id ? null : zone.id)
                    }
                  />
                );
              })}
            </GoogleMap>
          )}

          {/* Leyenda cuando hay zonas */}
          {isLoaded && zones.length > 0 && (
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
