'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { formatError } from '../lib/errorFormat';
import { isWithinSaltaCapital } from '../lib/constants';
import { useToast } from '../context/ToastContext';
import AddressAutocomplete from './AddressAutocomplete';

/* ── Estilos globales ─────────────────────────────────────────────────────── */
const MODAL_STYLES = `
@keyframes _ntm_spin { to { transform: rotate(360deg); } }
@keyframes _ntm_fade { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
@keyframes _ntm_shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position:  400px 0; }
}
._ntm_shimmer {
  background: linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%);
  background-size: 800px 100%;
  animation: _ntm_shimmer 1.4s infinite;
  border-radius: 6px;
}
`;

function Spinner({ size = 14, color = '#DC2626' }) {
  return (
    <div style={{
      width: size, height: size,
      border: `2px solid ${color}25`,
      borderTopColor: color,
      borderRadius: '50%',
      animation: '_ntm_spin 0.65s linear infinite',
      flexShrink: 0,
    }} />
  );
}

/* ── Componente principal ─────────────────────────────────────────────────── */
export default function NewTripModal({
  onClose,
  onSuccess,
  calculatePrice,
  tariffPerKm,
  tariffBase,
  commissionPercent,
  onRouteChange,
}) {
  const toast = useToast();
  const pickupInputRef = useRef(null);

  /* Recogida */
  const [pickupLabel, setPickupLabel] = useState('');
  const [pickupLat, setPickupLat] = useState(null);
  const [pickupLng, setPickupLng] = useState(null);
  const [placeId, setPlaceId] = useState('');

  /* Destino */
  const [destLabel, setDestLabel] = useState('');
  const [destLat, setDestLat] = useState(null);
  const [destLng, setDestLng] = useState(null);

  /* Opcionales */
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [showOptional, setShowOptional] = useState(false);

  /* Ruta */
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const [showOnMap, setShowOnMap] = useState(false);
  const [minimized, setMinimized] = useState(false);

  /* Submit */
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /* ── Limpiar ruta al desmontar ─────────────────────────────────────────── */
  useEffect(() => {
    return () => { onRouteChange?.(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Calcular ruta cuando hay origen + destino ────────────────────────── */
  useEffect(() => {
    if (!pickupLat || !pickupLng || !destLat || !destLng) {
      setRouteInfo(null);
      onRouteChange?.(null);
      return;
    }

    let cancelled = false;
    setRouteLoading(true);
    setRouteInfo(null);

    const qs = new URLSearchParams({ originLat: pickupLat, originLng: pickupLng, destLat, destLng, alternatives: 'true' });
    fetch(`/api/geo/directions?${qs}`)
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled) return;
        const d = payload?.data;
        if (!payload?.ok || !d) { setRouteLoading(false); return; }
        setRouteInfo({
          distanceKm: Math.round((Number(d.distanceValue) / 1000) * 10) / 10,
          durationMinutes: Math.round(Number(d.durationValue) / 60),
          polylineCoords: Array.isArray(d.polylineCoords) ? d.polylineCoords : [],
        });
        setRouteLoading(false);
      })
      .catch(() => { if (!cancelled) setRouteLoading(false); });

    return () => { cancelled = true; };
  }, [pickupLat, pickupLng, destLat, destLng]);

  /* ── Publicar ruta al mapa ────────────────────────────────────────────── */
  useEffect(() => {
    if (!onRouteChange) return;
    if (showOnMap && routeInfo?.polylineCoords?.length > 1) {
      onRouteChange({
        polylineCoords: routeInfo.polylineCoords,
        origin: { lat: pickupLat, lng: pickupLng, label: pickupLabel },
        destination: { lat: destLat, lng: destLng, label: destLabel },
      });
    } else {
      onRouteChange(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOnMap, routeInfo]);

  const autoPrice = routeInfo && calculatePrice ? calculatePrice(routeInfo.distanceKm) : null;

  /* ── Ver ruta en mapa (minimiza el modal) ─────────────────────────────── */
  const handleVerRuta = useCallback(() => {
    if (!routeInfo?.polylineCoords?.length) return;
    setShowOnMap(true);
    setMinimized(true);
  }, [routeInfo]);

  const onPickupSelect = (place) => {
    const lat = Number(place?.lat);
    const lng = Number(place?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    if (!isWithinSaltaCapital(lat, lng)) {
      setError('La dirección debe estar dentro de Salta Capital.');
      setPickupLat(null); setPickupLng(null); setPlaceId(''); setPickupLabel('');
      return;
    }
    setPickupLabel(place.formattedAddress || '');
    setPickupLat(lat); setPickupLng(lng);
    setPlaceId(place.placeId || '');
    setError('');
  };

  /* ── Submit ───────────────────────────────────────────────────────────── */
  const handleSubmit = async (e) => {
    e?.preventDefault();
    setError('');

    const currentPickupText = pickupInputRef.current?.value?.trim() || pickupLabel.trim();
    if (!currentPickupText) {
      setError('Ingresá la dirección de recogida del pasajero.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/trips/create-queued', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pickupAddress: currentPickupText,
          pickupLat,
          pickupLng,
          placeId: placeId || null,
          passengerName: passengerName.trim() || null,
          passengerPhone: passengerPhone.trim() || null,
          destinationHint: destLabel.trim() || null,
          destLat: destLat || null,
          destLng: destLng || null,
          notes: notes.trim() || null,
          price: autoPrice || null,
          distance_km: routeInfo?.distanceKm || null,
          duration_minutes: routeInfo?.durationMinutes || null,
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || 'No se pudo encolar el viaje.');
      }

      if (onSuccess) onSuccess(result.trip);
      onClose();
    } catch (err) {
      console.error('Error creating queued trip:', formatError(err));
      const message = err.message || 'Error al crear el viaje';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  /* ── Render minimizado ────────────────────────────────────────────────── */
  if (minimized) {
    return (
      <div style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        zIndex: 9999, width: 'calc(100% - 48px)', maxWidth: 580,
        animation: '_ntm_fade 0.18s ease',
      }}>
        <style>{MODAL_STYLES}</style>
        <div style={{
          background: '#FFFFFF', borderRadius: 18,
          boxShadow: '0 8px 40px rgba(0,0,0,0.28)',
          padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32,
              background: 'linear-gradient(135deg,#EF4444,#B91C1C)',
              borderRadius: 9, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 14, flexShrink: 0,
            }}>🚖</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>Nuevo viaje en cola</div>
              <div style={{
                fontSize: 12, color: '#0F172A', fontWeight: 600,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {pickupLabel ? `📍 ${pickupLabel}` : '—'}
                {destLabel ? ` → 📍 ${destLabel}` : ''}
              </div>
            </div>
            {routeInfo && (
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <span style={{ background: '#F1F5F9', borderRadius: 8, padding: '4px 9px', fontSize: 12, fontWeight: 700, color: '#0F172A' }}>
                  {routeInfo.distanceKm} km
                </span>
                {autoPrice != null && (
                  <span style={{ background: 'rgba(220,38,38,0.08)', borderRadius: 8, padding: '4px 9px', fontSize: 12, fontWeight: 700, color: '#DC2626' }}>
                    ${autoPrice.toLocaleString('es-AR')}
                  </span>
                )}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => { setMinimized(false); setShowOnMap(false); onRouteChange?.(null); }}
              style={{
                flex: 1, padding: '9px 12px',
                background: '#F1F5F9', border: '1px solid #E2E8F0',
                borderRadius: 10, color: '#64748B',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#E2E8F0'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#F1F5F9'; }}
            >
              ← Volver al formulario
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={handleSubmit}
              style={{
                flex: 2, padding: '9px 16px',
                background: loading ? '#CBD5E1' : 'linear-gradient(135deg,#EF4444 0%,#B91C1C 100%)',
                border: 'none', borderRadius: 10, color: '#FFFFFF',
                fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: loading ? 'none' : '0 4px 14px rgba(220,38,38,0.35)',
              }}
            >
              {loading ? <><Spinner size={13} color="#fff" /> Encolando…</> : '🚖 Encolar viaje'}
            </button>
          </div>
          {error && (
            <div style={{ padding: '7px 12px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, color: '#DC2626', fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
              <span>⚠️</span> {error}
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ── Render modal completo ────────────────────────────────────────────── */
  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(15,23,42,0.65)', backdropFilter: 'blur(6px)',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <style>{MODAL_STYLES}</style>
      <div style={{
        background: '#FFFFFF', borderRadius: 20,
        width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
        animation: '_ntm_fade 0.18s ease',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid #F1F5F9',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: '#FFFFFF', zIndex: 10,
          borderRadius: '20px 20px 0 0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36,
              background: 'linear-gradient(135deg, #EF4444, #B91C1C)',
              borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
            }}>🚖</div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Nuevo viaje</div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>
                Se encola y el sistema asigna chofer automáticamente
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, background: '#F1F5F9', border: 'none', borderRadius: 8,
              color: '#64748B', fontSize: 14, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#E2E8F0'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#F1F5F9'; }}
          >✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
          {/* Inputs */}
          <div style={{
            background: '#F8FAFC', border: '1px solid #E2E8F0',
            borderRadius: 14, padding: '4px 0', marginBottom: 16,
          }}>
            {/* Recogida */}
            <div style={{ padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <OriginDot />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>RECOGIDA</span>
              </div>
              <AddressAutocomplete
                id="new-trip-pickup"
                placeholder="Ej: Belgrano 1200, Salta"
                value={pickupLabel}
                accentColor="#DC2626"
                inputIcon={<OriginDotSmall />}
                onChange={(text) => { setPickupLabel(text); setPickupLat(null); setPickupLng(null); setPlaceId(''); }}
                onSelect={onPickupSelect}
              />
              {pickupLat != null && (
                <p style={{ color: '#059669', fontSize: 11, margin: '4px 0 0', fontWeight: 500 }}>✓ Ubicación confirmada</p>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px' }}>
              <div style={{ width: 1, height: 16, background: '#E2E8F0', marginLeft: 6 }} />
            </div>

            {/* Destino */}
            <div style={{ padding: '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <DestDot />
                <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>
                  DESTINO <span style={{ fontWeight: 400, color: '#94A3B8' }}>(opcional)</span>
                </span>
              </div>
              <AddressAutocomplete
                id="new-trip-dest"
                placeholder="Ej: Av. San Martín 500, Salta"
                value={destLabel}
                accentColor="#059669"
                inputIcon={<DestDotSmall />}
                onChange={(text) => { setDestLabel(text); setDestLat(null); setDestLng(null); }}
                onSelect={(place) => { setDestLabel(place.formattedAddress); setDestLat(place.lat); setDestLng(place.lng); }}
              />
            </div>
          </div>

          {/* Tarjeta de ruta */}
          {(routeLoading || routeInfo) && (
            <div style={{
              background: 'linear-gradient(135deg, #FFF5F5 0%, #FFF 100%)',
              border: '1px solid rgba(220,38,38,0.15)',
              borderRadius: 12, padding: '12px 16px', marginBottom: 14,
            }}>
              {routeLoading ? (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Spinner size={15} color="#DC2626" />
                  <span style={{ fontSize: 12, color: '#94A3B8' }}>Calculando ruta…</span>
                  <div style={{ flex: 1, display: 'flex', gap: 8 }}>
                    {[60, 50, 70].map((_, i) => (
                      <div key={i} className="_ntm_shimmer" style={{ height: 28, flex: 1 }} />
                    ))}
                  </div>
                </div>
              ) : routeInfo && (
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', letterSpacing: '0.06em', marginBottom: 8 }}>
                    RESUMEN DEL VIAJE
                  </div>
                  <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
                    <StatItem icon="📏" label="DISTANCIA" value={`${routeInfo.distanceKm} km`} valueColor="#0F172A" />
                    <div style={{ width: 1, background: 'rgba(220,38,38,0.15)', alignSelf: 'stretch' }} />
                    <StatItem icon="⏱️" label="TIEMPO" value={`${routeInfo.durationMinutes} min`} valueColor="#0F172A" />
                    {autoPrice != null && (
                      <>
                        <div style={{ width: 1, background: 'rgba(220,38,38,0.15)', alignSelf: 'stretch' }} />
                        <StatItem icon="💰" label="PRECIO EST." value={`$${autoPrice.toLocaleString('es-AR')}`} valueColor="#DC2626" />
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Opcionales */}
          <button
            type="button"
            onClick={() => setShowOptional((v) => !v)}
            style={{
              width: '100%', marginBottom: showOptional ? 12 : 4,
              padding: '7px 12px', background: 'none',
              border: '1px dashed #E2E8F0', borderRadius: 8,
              color: '#64748B', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#94A3B8'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#E2E8F0'; }}
          >
            <span style={{ fontSize: 10 }}>{showOptional ? '▲' : '▼'}</span>
            {showOptional ? 'Ocultar datos opcionales' : '+ Agregar pasajero, teléfono y notas'}
          </button>

          {showOptional && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 5, letterSpacing: '0.04em' }}>👤 PASAJERO</label>
                  <input type="text" placeholder="Nombre" value={passengerName} onChange={(e) => setPassengerName(e.target.value)} style={optInputStyle}
                    onFocus={(e) => { e.target.style.borderColor = '#DC2626'; e.target.style.boxShadow = '0 0 0 3px rgba(220,38,38,0.1)'; }}
                    onBlur={(e) => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 5, letterSpacing: '0.04em' }}>📞 TELÉFONO</label>
                  <input type="tel" placeholder="Ej: 3874001234" value={passengerPhone} onChange={(e) => setPassengerPhone(e.target.value)} style={optInputStyle}
                    onFocus={(e) => { e.target.style.borderColor = '#DC2626'; e.target.style.boxShadow = '0 0 0 3px rgba(220,38,38,0.1)'; }}
                    onBlur={(e) => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 5, letterSpacing: '0.04em' }}>📝 NOTAS</label>
                <input type="text" placeholder="Instrucciones adicionales..." value={notes} onChange={(e) => setNotes(e.target.value)} style={optInputStyle}
                  onFocus={(e) => { e.target.style.borderColor = '#DC2626'; e.target.style.boxShadow = '0 0 0 3px rgba(220,38,38,0.1)'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
            </div>
          )}

          {error && (
            <div style={{ padding: '9px 14px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, color: '#DC2626', fontSize: 12, fontWeight: 500, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span>⚠️</span> {error}
            </div>
          )}

          {/* Botones */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button" onClick={onClose}
                style={{
                  flex: 1, padding: '10px 14px',
                  background: '#F1F5F9', border: '1px solid #E2E8F0',
                  borderRadius: 12, color: '#64748B', fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#E2E8F0'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#F1F5F9'; }}
              >
                Cancelar
              </button>
              <button
                type="button" onClick={handleVerRuta}
                disabled={!routeInfo?.polylineCoords?.length || routeLoading}
                title={!routeInfo?.polylineCoords?.length ? 'Ingresá recogida y destino para ver la ruta' : 'Ver ruta en el mapa'}
                style={{
                  flex: 1, padding: '10px 14px',
                  background: routeInfo?.polylineCoords?.length
                    ? 'linear-gradient(135deg,#0EA5E9 0%,#0284C7 100%)'
                    : '#F1F5F9',
                  border: routeInfo?.polylineCoords?.length ? 'none' : '1px solid #E2E8F0',
                  borderRadius: 12,
                  color: routeInfo?.polylineCoords?.length ? '#FFFFFF' : '#94A3B8',
                  fontSize: 13, fontWeight: 700,
                  cursor: routeInfo?.polylineCoords?.length ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  boxShadow: routeInfo?.polylineCoords?.length ? '0 4px 12px rgba(14,165,233,0.35)' : 'none',
                }}
              >
                {routeLoading
                  ? <><Spinner size={13} color={routeInfo ? '#fff' : '#94A3B8'} /> Calculando…</>
                  : '🗺️ Ver en mapa'}
              </button>
            </div>
            <button
              type="submit" disabled={loading}
              style={{
                width: '100%', padding: '12px 16px',
                background: loading ? '#CBD5E1' : 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
                border: 'none', borderRadius: 12, color: '#FFFFFF',
                fontSize: 14, fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.75 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: loading ? 'none' : '0 4px 14px rgba(220,38,38,0.35)',
              }}
            >
              {loading ? <><Spinner size={14} color="#fff" /> Encolando…</> : '🚖 Encolar viaje'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Sub-componentes ──────────────────────────────────────────────────────── */
function OriginDot() {
  return <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#DC2626', border: '2px solid #FCA5A5', flexShrink: 0 }} />;
}
function OriginDotSmall() {
  return <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#DC2626', flexShrink: 0 }} />;
}
function DestDot() {
  return <div style={{ width: 10, height: 10, borderRadius: 2, background: '#059669', border: '2px solid #6EE7B7', flexShrink: 0 }} />;
}
function DestDotSmall() {
  return <div style={{ width: 8, height: 8, borderRadius: 2, background: '#059669', flexShrink: 0 }} />;
}

function StatItem({ icon, label, value, valueColor }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', padding: '0 8px' }}>
      <div style={{ fontSize: 13, marginBottom: 2 }}>{icon}</div>
      <div style={{ fontSize: 9, color: '#94A3B8', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: valueColor, lineHeight: 1 }}>{value}</div>
    </div>
  );
}

const optInputStyle = {
  width: '100%', padding: '9px 12px',
  background: '#FFFFFF', border: '1.5px solid #E2E8F0',
  borderRadius: 10, color: '#0F172A',
  fontSize: 13, outline: 'none', fontFamily: 'inherit',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};
