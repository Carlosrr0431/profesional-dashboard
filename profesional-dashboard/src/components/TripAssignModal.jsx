'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { sendPushNotification, formatPrice, formatKm } from '../lib/utils';
import { formatError } from '../lib/errorFormat';
import { buildDashboardAssignNotes } from '../lib/tripRequeue';
import { useToast } from '../context/ToastContext';
import AddressAutocomplete from './AddressAutocomplete';

/* ── Estilos globales ─────────────────────────────────────────────────────── */
const MODAL_STYLES = `
@keyframes _tm_spin { to { transform: rotate(360deg); } }
@keyframes _tm_fade { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
@keyframes _tm_shimmer {
  0%   { background-position: -400px 0; }
  100% { background-position: 400px 0; }
}
._tm_shimmer {
  background: linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%);
  background-size: 800px 100%;
  animation: _tm_shimmer 1.4s infinite;
  border-radius: 6px;
}
`;

/* ── Primitivas UI ────────────────────────────────────────────────────────── */
function Spinner({ size = 16, color = '#DC2626' }) {
  return (
    <div style={{
      width: size,
      height: size,
      border: `2px solid ${color}25`,
      borderTopColor: color,
      borderRadius: '50%',
      animation: '_tm_spin 0.65s linear infinite',
      flexShrink: 0,
    }} />
  );
}

function ToggleSwitch({ checked, onChange, label }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      <div style={{
        width: 36,
        height: 20,
        borderRadius: 10,
        background: checked ? '#DC2626' : '#CBD5E1',
        position: 'relative',
        transition: 'background 0.2s',
        flexShrink: 0,
      }}>
        <div style={{
          position: 'absolute',
          top: 2,
          left: checked ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#FFFFFF',
          boxShadow: '0 1px 4px rgba(0,0,0,0.2)',
          transition: 'left 0.2s',
        }} />
      </div>
      {label && (
        <span style={{ fontSize: 12, fontWeight: 600, color: checked ? '#DC2626' : '#64748B' }}>
          {label}
        </span>
      )}
    </button>
  );
}

/* ── Componente principal ─────────────────────────────────────────────────── */
export default function TripAssignModal({
  driver,
  onClose,
  onSuccess,
  calculatePrice,
  tariffPerKm,
  tariffBase,
  commissionPercent,
  onRouteChange,
}) {
  const toast = useToast();

  /* Origen */
  const [originAddress, setOriginAddress] = useState('');
  const [originLat, setOriginLat] = useState(null);
  const [originLng, setOriginLng] = useState(null);
  const [originMode, setOriginMode] = useState('custom');
  const [originGeocodeSource, setOriginGeocodeSource] = useState(null);

  /* Destino */
  const [destAddress, setDestAddress] = useState('');
  const [destLat, setDestLat] = useState(null);
  const [destLng, setDestLng] = useState(null);

  /* Opcionales */
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [showOptional, setShowOptional] = useState(false);

  /* Ruta */
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null); // { distanceKm, durationMinutes, polylineCoords }
  const [showOnMap, setShowOnMap] = useState(false);

  /* Modal minimizado (vista mapa completo) */
  const [minimized, setMinimized] = useState(false);

  /* Submit */
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  /* ── Limpiar ruta al desmontar ─────────────────────────────────────────── */
  useEffect(() => {
    return () => { onRouteChange?.(null); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Usar ubicación del chofer como origen ────────────────────────────── */
  useEffect(() => {
    if (originMode !== 'driver') return;
    const lat = parseFloat(driver?.lat);
    const lng = parseFloat(driver?.lng);
    if (!lat || !lng || (lat === 0 && lng === 0)) {
      setOriginAddress('Ubicación no disponible');
      setOriginLat(null);
      setOriginLng(null);
      setOriginGeocodeSource(null);
      return;
    }
    setOriginLat(lat);
    setOriginLng(lng);
    setOriginGeocodeSource(null);
    fetch(`/api/geo/reverse?lat=${lat}&lng=${lng}`)
      .then((r) => r.json())
      .then((p) => setOriginAddress(p?.ok ? (p.data?.formattedAddress || `${lat.toFixed(5)}, ${lng.toFixed(5)}`) : `${lat.toFixed(5)}, ${lng.toFixed(5)}`))
      .catch(() => setOriginAddress(`${lat.toFixed(5)}, ${lng.toFixed(5)}`));
  }, [driver, originMode]);

  /* ── Calcular ruta cuando hay origen + destino ────────────────────────── */
  useEffect(() => {
    if (!originLat || !originLng || !destLat || !destLng) {
      setRouteInfo(null);
      return;
    }

    let cancelled = false;
    setRouteLoading(true);
    setRouteInfo(null);

    const qs = new URLSearchParams({
      originLat, originLng, destLat, destLng, alternatives: 'true',
    });
    fetch(`/api/geo/directions?${qs}`)
      .then((r) => r.json())
      .then((payload) => {
        if (cancelled) return;
        const d = payload?.data;
        if (!payload?.ok || !d) { setRouteLoading(false); return; }
        const info = {
          distanceKm: Math.round((Number(d.distanceValue) / 1000) * 10) / 10,
          durationMinutes: Math.round(Number(d.durationValue) / 60),
          polylineCoords: Array.isArray(d.polylineCoords) ? d.polylineCoords : [],
        };
        setRouteInfo(info);
        setRouteLoading(false);
      })
      .catch(() => { if (!cancelled) setRouteLoading(false); });

    return () => { cancelled = true; };
  }, [originLat, originLng, destLat, destLng]);

  const hasOriginPoint = originLat != null && originLng != null;
  const hasFullRoute = routeInfo?.polylineCoords?.length > 1;
  const canShowOnMap = hasFullRoute || hasOriginPoint;

  /* ── Publicar ruta al mapa ────────────────────────────────────────────── */
  useEffect(() => {
    if (!onRouteChange) return;
    if (!showOnMap) {
      onRouteChange(null);
      return;
    }

    if (hasFullRoute) {
      onRouteChange({
        polylineCoords: routeInfo.polylineCoords,
        origin: { lat: originLat, lng: originLng, label: originAddress },
        destination: destLat != null && destLng != null
          ? { lat: destLat, lng: destLng, label: destAddress }
          : null,
      });
      return;
    }

    if (hasOriginPoint) {
      onRouteChange({
        polylineCoords: [],
        origin: { lat: originLat, lng: originLng, label: originAddress },
        destination: null,
      });
      return;
    }

    onRouteChange(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOnMap, routeInfo, originLat, originLng, originAddress, destLat, destLng, destAddress]);

  /* ── Precio estimado ──────────────────────────────────────────────────── */
  const autoPrice = routeInfo ? calculatePrice(routeInfo.distanceKm) : null;
  const autoCommission = autoPrice ? Math.round(autoPrice * (commissionPercent || 10) / 100) : null;

  /* ── Ver ruta u origen en mapa (minimiza el modal) ────────────────────── */
  const handleVerRuta = useCallback(() => {
    if (!canShowOnMap) return;
    setShowOnMap(true);
    setMinimized(true);
  }, [canShowOnMap]);

  /* ── Geocodificar dirección escrita sin seleccionar ───────────────────── */
  const geocodeTyped = useCallback(async (address) => {
    try {
      const res = await fetch(`/api/geo/geocode?address=${encodeURIComponent(`${address}, Salta, Argentina`)}`);
      const p = await res.json();
      if (p?.ok) return { lat: p.data.lat, lng: p.data.lng, formatted: p.data.formattedAddress };
    } catch { /* ignorar */ }
    return null;
  }, []);

  /* ── Submit ───────────────────────────────────────────────────────────── */
  const handleSubmit = async (e) => {
    e?.preventDefault();
    setError('');

    if (originMode === 'driver' && (!originLat || !originLng)) {
      setError('El chofer no tiene ubicación disponible. Cambiá a dirección manual.');
      return;
    }

    let finalOriginAddress = originAddress;
    let finalOriginLat = originLat;
    let finalOriginLng = originLng;
    let finalDestAddress = destAddress.trim();
    let finalDestLat = destLat;
    let finalDestLng = destLng;

    if (originMode === 'custom' && finalOriginAddress && (!finalOriginLat || !finalOriginLng)) {
      const r = await geocodeTyped(finalOriginAddress);
      if (r) {
        finalOriginLat = r.lat; finalOriginLng = r.lng; finalOriginAddress = r.formatted;
        setOriginLat(r.lat); setOriginLng(r.lng); setOriginAddress(r.formatted);
      } else {
        setError('No se pudo encontrar la dirección de recogida. Probá con otra.');
        return;
      }
    }

    if (finalDestAddress && (!finalDestLat || !finalDestLng)) {
      const r = await geocodeTyped(finalDestAddress);
      if (r) {
        finalDestLat = r.lat; finalDestLng = r.lng; finalDestAddress = r.formatted;
        setDestLat(r.lat); setDestLng(r.lng); setDestAddress(r.formatted);
      } else {
        setError('No se pudo encontrar la dirección de destino. Probá con otra.');
        return;
      }
    }

    if (!finalOriginAddress || !finalOriginLat || !finalOriginLng) {
      setError('Ingresá la dirección de recogida del pasajero');
      return;
    }

    setSubmitting(true);
    try {
      const driverLat = parseFloat(driver?.lat);
      const driverLng = parseFloat(driver?.lng);
      const hasDriverCoords =
        Number.isFinite(driverLat) && Number.isFinite(driverLng) && !(driverLat === 0 && driverLng === 0);

      const tripNotes = buildDashboardAssignNotes({
        userNotes: notes.trim(),
        dropoffAddress: finalDestAddress || 'A confirmar',
        dropoffLat: finalDestLat,
        dropoffLng: finalDestLng,
      });

      const tripData = {
        driver_id: driver.id,
        passenger_name: passengerName.trim() || 'Pasajero',
        passenger_phone: passengerPhone.trim() || null,
        destination_address: finalOriginAddress,
        destination_lat: finalOriginLat,
        destination_lng: finalOriginLng,
        origin_address: hasDriverCoords ? `${driverLat.toFixed(5)}, ${driverLng.toFixed(5)}` : null,
        origin_lat: hasDriverCoords ? driverLat : null,
        origin_lng: hasDriverCoords ? driverLng : null,
        status: 'pending',
        dispatch_status: 'waiting_acceptance',
        assigned_at: new Date().toISOString(),
        price: autoPrice || null,
        commission_amount: autoCommission || null,
        distance_km: routeInfo?.distanceKm || null,
        duration_minutes: routeInfo?.durationMinutes || null,
        notes: tripNotes,
        wa_context: { dispatch_excluded_driver_ids: [] },
      };

      const { data, error: insertError } = await supabase.from('trips').insert(tripData).select().single();
      if (insertError) throw insertError;

      try {
        const { data: driverData } = await supabase
          .from('drivers').select('push_token, full_name').eq('id', driver.id).single();
        if (driverData?.push_token) {
          const priceText = data.price ? ` · ${formatPrice(data.price)}` : '';
          const distText = data.distance_km ? ` · ${formatKm(data.distance_km)}` : '';
          await sendPushNotification(driverData.push_token, {
            title: 'Nuevo viaje asignado',
            body: `${tripData.passenger_name} → ${finalOriginAddress}${distText}${priceText}`,
            data: { type: 'new_trip', tripId: data.id, trip: data },
            driverId: driver.id,
          });
        }
      } catch {
        toast.warning('Viaje creado, pero no se pudo notificar al chofer');
      }

      onSuccess?.(data);
      onClose();
    } catch (err) {
      const msg = err.message || 'Error al crear el viaje';
      setError(msg);
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Render minimizado (barra flotante sobre el mapa) ─────────────────── */
  if (minimized) {
    return (
      <div
        style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          zIndex: 9999, width: 'calc(100% - 48px)', maxWidth: 600,
          animation: '_tm_fade 0.18s ease',
        }}
      >
        <style>{MODAL_STYLES}</style>
        <div style={{
          background: '#FFFFFF',
          borderRadius: 18,
          boxShadow: '0 8px 40px rgba(0,0,0,0.28)',
          padding: '12px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          {/* Ruta resumida */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32,
              background: 'linear-gradient(135deg,#EF4444,#B91C1C)',
              borderRadius: 9, display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 14, flexShrink: 0,
            }}>🚖</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11, color: '#94A3B8', fontWeight: 600 }}>
                Chofer: <strong style={{ color: '#475569' }}>{driver?.fullName || driver?.full_name || '—'}</strong>
              </div>
              <div style={{
                fontSize: 12, color: '#0F172A', fontWeight: 600,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {originAddress ? `📍 ${originAddress}` : '—'}
                {destAddress ? ` → 📍 ${destAddress}` : ''}
              </div>
            </div>
            {routeInfo && (
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <span style={{
                  background: '#F1F5F9', borderRadius: 8,
                  padding: '4px 9px', fontSize: 12, fontWeight: 700, color: '#0F172A',
                }}>
                  {routeInfo.distanceKm} km
                </span>
                {autoPrice != null && (
                  <span style={{
                    background: 'rgba(220,38,38,0.08)', borderRadius: 8,
                    padding: '4px 9px', fontSize: 12, fontWeight: 700, color: '#DC2626',
                  }}>
                    ${autoPrice.toLocaleString('es-AR')}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Acciones */}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={() => { setMinimized(false); setShowOnMap(false); onRouteChange?.(null); }}
              style={{
                flex: 1, padding: '9px 12px',
                background: '#F1F5F9', border: '1px solid #E2E8F0',
                borderRadius: 10, color: '#64748B',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = '#E2E8F0'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = '#F1F5F9'; }}
            >
              ← Volver al formulario
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleSubmit}
              style={{
                flex: 2, padding: '9px 16px',
                background: submitting ? '#CBD5E1' : 'linear-gradient(135deg,#EF4444 0%,#B91C1C 100%)',
                border: 'none', borderRadius: 10,
                color: '#FFFFFF', fontSize: 13, fontWeight: 700,
                cursor: submitting ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: submitting ? 'none' : '0 4px 14px rgba(220,38,38,0.35)',
              }}
            >
              {submitting ? <><Spinner size={13} color="#fff" /> Asignando…</> : '🚖 Asignar Viaje'}
            </button>
          </div>

          {error && (
            <div style={{
              padding: '7px 12px', background: '#FEF2F2',
              border: '1px solid #FCA5A5', borderRadius: 8,
              color: '#DC2626', fontSize: 12, fontWeight: 500,
              display: 'flex', alignItems: 'center', gap: 5,
            }}>
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

      <div
        style={{
          background: '#FFFFFF',
          borderRadius: 20,
          width: '100%',
          maxWidth: 520,
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 24px 64px rgba(0,0,0,0.28)',
          animation: '_tm_fade 0.18s ease',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div style={{
          padding: '16px 20px',
          borderBottom: '1px solid #F1F5F9',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          position: 'sticky', top: 0, background: '#FFFFFF', zIndex: 10,
          borderRadius: '20px 20px 0 0',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 36, height: 36,
              background: 'linear-gradient(135deg, #EF4444, #B91C1C)',
              borderRadius: 10,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16,
            }}>
              🚖
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0F172A' }}>Asignar Viaje</div>
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 1 }}>
                Chofer: <strong style={{ color: '#475569' }}>{driver?.fullName || driver?.full_name || '—'}</strong>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32, height: 32,
              background: '#F1F5F9', border: 'none', borderRadius: 8,
              color: '#64748B', fontSize: 14, cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.1s',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#E2E8F0'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#F1F5F9'; }}
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
          {/* ── Inputs de dirección ──────────────────────────────────────── */}
          <div style={{
            background: '#F8FAFC',
            border: '1px solid #E2E8F0',
            borderRadius: 14,
            padding: '4px 0',
            marginBottom: 16,
          }}>
            {/* Origen */}
            <div style={{ padding: '10px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <OriginDot />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748B', letterSpacing: '0.04em' }}>
                    RECOGIDA
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setOriginMode((m) => (m === 'driver' ? 'custom' : 'driver'))}
                  style={{
                    background: originMode === 'driver' ? 'rgba(220,38,38,0.08)' : 'none',
                    border: originMode === 'driver' ? '1px solid rgba(220,38,38,0.2)' : '1px solid #E2E8F0',
                    borderRadius: 6, color: '#DC2626',
                    fontSize: 10, fontWeight: 700, cursor: 'pointer',
                    padding: '3px 8px', transition: 'all 0.15s',
                  }}
                >
                  {originMode === 'driver' ? '✓ Ubicación del chofer' : 'Usar ubicación del chofer'}
                </button>
              </div>
              {originMode === 'driver' ? (
                <div style={{
                  padding: '9px 12px',
                  background: '#FFF7F7',
                  border: '1px solid rgba(220,38,38,0.2)',
                  borderRadius: 8,
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <span style={{ fontSize: 13 }}>📍</span>
                  <span style={{ fontSize: 12, color: '#DC2626', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {originAddress || 'Obteniendo ubicación del chofer…'}
                  </span>
                </div>
              ) : (
                <AddressAutocomplete
                  id="assign-origin"
                  placeholder="Ej: Belgrano 1200, Salta"
                  value={originAddress}
                  accentColor="#DC2626"
                  inputIcon={<OriginDotSmall />}
                  onChange={(text) => {
                    setOriginAddress(text);
                    setOriginLat(null);
                    setOriginLng(null);
                    setOriginGeocodeSource(null);
                  }}
                  onSelect={(place) => {
                    setOriginAddress(place.formattedAddress);
                    setOriginLat(place.lat);
                    setOriginLng(place.lng);
                    setOriginGeocodeSource(place.geocodeSource || null);
                  }}
                />
              )}
              {originMode === 'custom' && originLat != null && originGeocodeSource && (
                <div style={{ marginTop: 4 }}>
                  <span
                    title={originGeocodeSource === 'supabase_cache' ? 'Coordenadas desde cache en base de datos' : 'Coordenadas desde Google Place Details Essentials'}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.03em',
                      background: originGeocodeSource === 'supabase_cache' ? '#ECFDF5' : '#EFF6FF',
                      color: originGeocodeSource === 'supabase_cache' ? '#047857' : '#1D4ED8',
                    }}
                  >
                    {originGeocodeSource === 'supabase_cache' ? 'cache BD' : 'Google'}
                  </span>
                </div>
              )}
            </div>

            {/* Separador visual */}
            <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px' }}>
              <div style={{ width: 1, height: 16, background: '#E2E8F0', marginLeft: 6, marginRight: 0 }} />
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
                id="assign-dest"
                placeholder="Ej: Av. San Martín 500, Salta"
                value={destAddress}
                accentColor="#059669"
                inputIcon={<DestDotSmall />}
                onChange={(text) => { setDestAddress(text); setDestLat(null); setDestLng(null); }}
                onSelect={(place) => { setDestAddress(place.formattedAddress); setDestLat(place.lat); setDestLng(place.lng); }}
              />
            </div>
          </div>

          {/* ── Tarjeta de ruta ──────────────────────────────────────────── */}
          {(routeLoading || routeInfo) && (
            <div style={{
              background: 'linear-gradient(135deg, #FFF5F5 0%, #FFF 100%)',
              border: '1px solid rgba(220,38,38,0.15)',
              borderRadius: 12,
              padding: '12px 16px',
              marginBottom: 14,
            }}>
              {routeLoading ? (
                <RouteLoadingSkeleton />
              ) : (
                <RouteInfoCard
                  routeInfo={routeInfo}
                  autoPrice={autoPrice}
                  autoCommission={autoCommission}
                  tariffBase={tariffBase}
                  tariffPerKm={tariffPerKm}
                  commissionPercent={commissionPercent}
                />
              )}
            </div>
          )}

          {/* ── Toggle mostrar en mapa ───────────────────────────────────── */}
          {routeInfo && routeInfo.polylineCoords?.length > 1 && (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 12px',
              background: showOnMap ? 'rgba(220,38,38,0.05)' : '#F8FAFC',
              border: `1px solid ${showOnMap ? 'rgba(220,38,38,0.18)' : '#E2E8F0'}`,
              borderRadius: 10,
              marginBottom: 14,
              transition: 'all 0.2s',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14 }}>🗺️</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: '#475569' }}>Mostrar ruta en el mapa</span>
              </div>
              <ToggleSwitch checked={showOnMap} onChange={setShowOnMap} />
            </div>
          )}

          {/* ── Campos opcionales ────────────────────────────────────────── */}
          <button
            type="button"
            onClick={() => setShowOptional((v) => !v)}
            style={{
              width: '100%', marginBottom: showOptional ? 12 : 4,
              padding: '7px 12px',
              background: 'none', border: '1px dashed #E2E8F0',
              borderRadius: 8, color: '#64748B',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              textAlign: 'left', display: 'flex', alignItems: 'center', gap: 6,
              transition: 'border-color 0.15s',
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
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 5, letterSpacing: '0.04em' }}>
                    👤 PASAJERO
                  </label>
                  <input
                    type="text"
                    placeholder="Nombre"
                    value={passengerName}
                    onChange={(e) => setPassengerName(e.target.value)}
                    style={optInputStyle}
                    onFocus={(e) => { e.target.style.borderColor = '#DC2626'; e.target.style.boxShadow = '0 0 0 3px rgba(220,38,38,0.1)'; }}
                    onBlur={(e) => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 5, letterSpacing: '0.04em' }}>
                    📞 TELÉFONO
                  </label>
                  <input
                    type="tel"
                    placeholder="Ej: 3874001234"
                    value={passengerPhone}
                    onChange={(e) => setPassengerPhone(e.target.value)}
                    style={optInputStyle}
                    onFocus={(e) => { e.target.style.borderColor = '#DC2626'; e.target.style.boxShadow = '0 0 0 3px rgba(220,38,38,0.1)'; }}
                    onBlur={(e) => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 5, letterSpacing: '0.04em' }}>
                  📝 NOTAS
                </label>
                <input
                  type="text"
                  placeholder="Instrucciones adicionales..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={optInputStyle}
                  onFocus={(e) => { e.target.style.borderColor = '#DC2626'; e.target.style.boxShadow = '0 0 0 3px rgba(220,38,38,0.1)'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
            </div>
          )}

          {/* ── Error ────────────────────────────────────────────────────── */}
          {error && (
            <div style={{
              padding: '9px 14px',
              background: '#FEF2F2', border: '1px solid #FCA5A5',
              borderRadius: 8, color: '#DC2626',
              fontSize: 12, fontWeight: 500, marginBottom: 12,
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span>⚠️</span> {error}
            </div>
          )}

          {/* ── Botones ──────────────────────────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {/* Fila 1: Cancelar + Ver ruta */}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={onClose}
                style={{
                  flex: 1, padding: '10px 14px',
                  background: '#F1F5F9', border: '1px solid #E2E8F0',
                  borderRadius: 12, color: '#64748B',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#E2E8F0'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#F1F5F9'; }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleVerRuta}
                disabled={!canShowOnMap || routeLoading}
                title={
                  !canShowOnMap
                    ? 'Confirmá el origen para verlo en el mapa'
                    : (hasFullRoute ? 'Ver ruta en el mapa' : 'Ver punto de origen en el mapa')
                }
                style={{
                  flex: 1, padding: '10px 14px',
                  background: canShowOnMap
                    ? 'linear-gradient(135deg,#0EA5E9 0%,#0284C7 100%)'
                    : '#F1F5F9',
                  border: canShowOnMap ? 'none' : '1px solid #E2E8F0',
                  borderRadius: 12,
                  color: canShowOnMap ? '#FFFFFF' : '#94A3B8',
                  fontSize: 13, fontWeight: 700,
                  cursor: canShowOnMap && !routeLoading ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  boxShadow: canShowOnMap ? '0 4px 12px rgba(14,165,233,0.35)' : 'none',
                  transition: 'all 0.15s',
                }}
              >
                {routeLoading ? (
                  <><Spinner size={13} color={routeInfo ? '#fff' : '#94A3B8'} /> Calculando…</>
                ) : (
                  '🗺️ Ver en mapa'
                )}
              </button>
            </div>

            {/* Fila 2: Asignar viaje (ancho completo) */}
            <button
              type="submit"
              disabled={submitting}
              style={{
                width: '100%', padding: '12px 16px',
                background: submitting ? '#CBD5E1' : 'linear-gradient(135deg, #EF4444 0%, #B91C1C 100%)',
                border: 'none', borderRadius: 12,
                color: '#FFFFFF', fontSize: 14, fontWeight: 700,
                cursor: submitting ? 'not-allowed' : 'pointer',
                opacity: submitting ? 0.75 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                boxShadow: submitting ? 'none' : '0 4px 14px rgba(220,38,38,0.35)',
                transition: 'all 0.15s',
              }}
            >
              {submitting ? (
                <><Spinner size={14} color="#fff" /> Asignando…</>
              ) : (
                '🚖 Asignar Viaje'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Sub-componentes visuales ─────────────────────────────────────────────── */

function OriginDot() {
  return (
    <div style={{
      width: 10, height: 10, borderRadius: '50%',
      background: '#DC2626', border: '2px solid #FCA5A5',
      flexShrink: 0,
    }} />
  );
}
function OriginDotSmall() {
  return <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#DC2626', flexShrink: 0 }} />;
}
function DestDot() {
  return (
    <div style={{
      width: 10, height: 10, borderRadius: 2,
      background: '#059669', border: '2px solid #6EE7B7',
      flexShrink: 0,
    }} />
  );
}
function DestDotSmall() {
  return <div style={{ width: 8, height: 8, borderRadius: 2, background: '#059669', flexShrink: 0 }} />;
}

function RouteLoadingSkeleton() {
  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <Spinner size={16} color="#DC2626" />
      <span style={{ fontSize: 12, color: '#94A3B8', fontWeight: 500 }}>Calculando ruta…</span>
      <div style={{ flex: 1, display: 'flex', gap: 8 }}>
        {[60, 50, 70].map((w, i) => (
          <div key={i} className="_tm_shimmer" style={{ height: 28, flex: 1 }} />
        ))}
      </div>
    </div>
  );
}

function RouteInfoCard({ routeInfo, autoPrice, autoCommission, tariffBase, tariffPerKm, commissionPercent }) {
  const divider = <div style={{ width: 1, background: 'rgba(220,38,38,0.15)', alignSelf: 'stretch' }} />;

  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#DC2626', letterSpacing: '0.06em', marginBottom: 8 }}>
        RESUMEN DEL VIAJE
      </div>
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 0 }}>
        <StatItem
          icon="📏"
          label="DISTANCIA"
          value={`${routeInfo.distanceKm} km`}
          valueColor="#0F172A"
        />
        {divider}
        <StatItem
          icon="⏱️"
          label="TIEMPO"
          value={`${routeInfo.durationMinutes} min`}
          valueColor="#0F172A"
        />
        {divider}
        <StatItem
          icon="💰"
          label="PRECIO"
          value={autoPrice != null ? `$${autoPrice.toLocaleString('es-AR')}` : '—'}
          valueColor="#DC2626"
          sub={tariffBase > 0 ? `$${tariffBase} + $${tariffPerKm}/km` : `$${tariffPerKm}/km`}
        />
        {autoCommission > 0 && (
          <>
            {divider}
            <StatItem
              icon="🏷️"
              label="COMISIÓN"
              value={`$${autoCommission.toLocaleString('es-AR')}`}
              valueColor="#D97706"
              sub={`${commissionPercent}%`}
            />
          </>
        )}
      </div>
    </div>
  );
}

function StatItem({ icon, label, value, valueColor, sub }) {
  return (
    <div style={{ flex: 1, textAlign: 'center', padding: '0 8px' }}>
      <div style={{ fontSize: 13, marginBottom: 2 }}>{icon}</div>
      <div style={{ fontSize: 9, color: '#94A3B8', fontWeight: 700, letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 800, color: valueColor, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 9, color: '#94A3B8', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const optInputStyle = {
  width: '100%',
  padding: '9px 12px',
  background: '#FFFFFF',
  border: '1.5px solid #E2E8F0',
  borderRadius: 10,
  color: '#0F172A',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};
