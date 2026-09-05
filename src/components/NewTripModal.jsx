'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { formatError } from '../lib/errorFormat';
import { isWithinSaltaCapital } from '../lib/constants';
import { useToast } from '../context/ToastContext';
import AddressAutocomplete from './AddressAutocomplete';
import { ScheduleDatePicker, ScheduleTimePicker } from './ScheduleDateTimePickers';
import {
  DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS,
  arLocalDateTimeToUtcDate,
  coerceArScheduleIfTonightStillValid,
  defaultArScheduleParts,
  formatArScheduleDisplay,
} from '../lib/promoteDueScheduledTrips';
import { assignExistingTripToDriver } from '../lib/assignExistingTripClient';
import {
  findDashboardDriversByNumber,
  dashboardDriverAvailability,
  driverDisplayName,
} from '../lib/assignExistingTrip';

/* ── Estilos globales ─────────────────────────────────────────────────────── */
const MODAL_STYLES = `
@keyframes _ntm_spin { to { transform: rotate(360deg); } }
@keyframes _ntm_fade { from { opacity: 0; transform: scale(0.96); } to { opacity: 1; transform: scale(1); } }
._ntm_scroll {
  scrollbar-width: thin;
  scrollbar-color: #E2E8F0 transparent;
}
._ntm_scroll::-webkit-scrollbar { width: 6px; }
._ntm_scroll::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 99px; }
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
  asPopover = false,
  drivers = [],
}) {
  const toast = useToast();
  const pickupInputRef = useRef(null);
  const modalScrollRef = useRef(null);
  const scheduleSectionRef = useRef(null);

  /* Recogida */
  const [pickupLabel, setPickupLabel] = useState('');
  const [pickupTitle, setPickupTitle] = useState('');
  const [pickupSubtitle, setPickupSubtitle] = useState('');
  const [pickupLat, setPickupLat] = useState(null);
  const [pickupLng, setPickupLng] = useState(null);
  const [placeId, setPlaceId] = useState('');
  const [pickupGeocodeSource, setPickupGeocodeSource] = useState(null);

  /* Destino */
  const [destLabel, setDestLabel] = useState('');
  const [destLat, setDestLat] = useState(null);
  const [destLng, setDestLng] = useState(null);

  /* Opcionales */
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [isScheduled, setIsScheduled] = useState(false);
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('');
  const [driverMode, setDriverMode] = useState('nearest');
  const [driverNumberQuery, setDriverNumberQuery] = useState('');
  const [selectedDriverId, setSelectedDriverId] = useState(null);

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

  const hasPickupPoint = pickupLat != null && pickupLng != null;
  const hasFullRoute = routeInfo?.polylineCoords?.length > 1;
  const canShowOnMap = hasFullRoute || hasPickupPoint;

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
        origin: { lat: pickupLat, lng: pickupLng, label: pickupLabel },
        destination: destLat != null && destLng != null
          ? { lat: destLat, lng: destLng, label: destLabel }
          : null,
      });
      return;
    }

    if (hasPickupPoint) {
      onRouteChange({
        polylineCoords: [],
        origin: { lat: pickupLat, lng: pickupLng, label: pickupLabel },
        destination: null,
      });
      return;
    }

    onRouteChange(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showOnMap, routeInfo, pickupLat, pickupLng, pickupLabel, destLat, destLng, destLabel]);

  const autoPrice = routeInfo && calculatePrice ? calculatePrice(routeInfo.distanceKm) : null;

  /* ── Ver ruta o punto de recogida en mapa (minimiza el modal) ─────────── */
  const handleVerRuta = useCallback(() => {
    if (!canShowOnMap) return;
    setShowOnMap(true);
    setMinimized(true);
  }, [canShowOnMap]);

  const onPickupSelect = (place) => {
    const lat = Number(place?.lat);
    const lng = Number(place?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setError('No se pudo ubicar la dirección de origen. Elegila de nuevo de la lista.');
      setPickupLat(null); setPickupLng(null); setPlaceId(''); setPickupLabel('');
      setPickupTitle(''); setPickupSubtitle(''); setPickupGeocodeSource(null);
      return;
    }
    if (!isWithinSaltaCapital(lat, lng)) {
      setError('La dirección debe estar dentro de Salta Capital.');
      setPickupLat(null); setPickupLng(null); setPlaceId(''); setPickupLabel('');
      setPickupTitle(''); setPickupSubtitle(''); setPickupGeocodeSource(null);
      return;
    }
    setPickupLabel(place.formattedAddress || '');
    setPickupTitle(place.title || '');
    setPickupSubtitle(place.subtitle || '');
    setPickupLat(lat); setPickupLng(lng);
    setPlaceId(place.placeId || '');
    setPickupGeocodeSource(place.geocodeSource || null);
    setError('');
  };

  const setScheduledMode = (next) => {
    setIsScheduled((prev) => {
      if (prev === next) return prev;
      if (next) {
        const parts = defaultArScheduleParts();
        setScheduleDate((current) => current || parts.date);
        setScheduleTime((current) => current || parts.time);
      }
      return next;
    });
  };

  const driverMatches = useMemo(
    () => (driverMode === 'choose' ? findDashboardDriversByNumber(drivers, driverNumberQuery) : []),
    [driverMode, drivers, driverNumberQuery],
  );

  useEffect(() => {
    if (driverMode !== 'choose') {
      setSelectedDriverId(null);
      return;
    }
    if (driverMatches.length === 1) {
      setSelectedDriverId(driverMatches[0].id);
      return;
    }
    setSelectedDriverId((prev) => (
      driverMatches.some((driver) => driver.id === prev) ? prev : null
    ));
  }, [driverMode, driverMatches]);

  const selectedDriver = driverMatches.find((driver) => driver.id === selectedDriverId) || null;
  const selectedAvailability = selectedDriver ? dashboardDriverAvailability(selectedDriver) : null;

  useEffect(() => {
    if (!isScheduled) return undefined;
    const timer = window.setTimeout(() => {
      const modal = modalScrollRef.current;
      const section = scheduleSectionRef.current;
      if (!modal || !section) return;
      const modalRect = modal.getBoundingClientRect();
      const sectionRect = section.getBoundingClientRect();
      const hiddenBottom = sectionRect.bottom - modalRect.bottom + 18;
      if (hiddenBottom > 4) {
        modal.scrollTo({ top: modal.scrollTop + hiddenBottom, behavior: 'smooth' });
      }
    }, 60);
    return () => window.clearTimeout(timer);
  }, [isScheduled]);

  /* ── Submit ───────────────────────────────────────────────────────────── */
  const handleSubmit = async (e) => {
    e?.preventDefault();
    setError('');

    const currentPickupText = pickupInputRef.current?.value?.trim() || pickupLabel.trim();
    if (!currentPickupText) {
      setError('Ingresá la dirección de origen del pasajero.');
      return;
    }

    let scheduledForIso = null;
    let scheduledDisplay = null;
    if (isScheduled) {
      if (!scheduleDate || !scheduleTime) {
        setError('Completá el día y la hora del viaje programado.');
        return;
      }
      if (passengerPhone.trim() && passengerPhone.replace(/\D/g, '').length < 8) {
        setError('Si cargás teléfono, usá al menos 8 dígitos.');
        return;
      }
      const coerced = coerceArScheduleIfTonightStillValid(scheduleDate, scheduleTime);
      const scheduledUtc = arLocalDateTimeToUtcDate(coerced.date, coerced.time);
      if (!scheduledUtc) {
        setError('La fecha u hora no es válida.');
        return;
      }
      if (scheduledUtc.getTime() <= Date.now() + 60_000) {
        setError('La hora programada tiene que ser al menos 2 minutos más adelante.');
        return;
      }
      scheduledForIso = scheduledUtc.toISOString();
      scheduledDisplay = formatArScheduleDisplay(scheduledUtc);
    }

    if (driverMode === 'choose') {
      if (!selectedDriver?.id) {
        setError('Ingresá el número de móvil y seleccioná el chofer.');
        return;
      }
      if (!isScheduled && selectedAvailability && !selectedAvailability.canAssign) {
        setError(`Ese móvil no está libre ahora (${selectedAvailability.label}).`);
        return;
      }
    }

    setLoading(true);
    try {
      const response = await fetch('/api/trips/create-queued', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'dashboard',
          pickupAddress: currentPickupText,
          pickupLat,
          pickupLng,
          placeId: placeId || null,
          passengerName: passengerName.trim() || null,
          passengerPhone: passengerPhone.trim() || null,
          ...(destLabel.trim() ? { destinationHint: destLabel.trim() } : {}),
          ...(destLat != null && destLng != null
            && Number.isFinite(Number(destLat)) && Number.isFinite(Number(destLng))
            ? {
              destinationLat: destLat,
              destinationLng: destLng,
              destLat,
              destLng,
            }
            : {}),
          notes: notes.trim() || null,
          estimatedPrice: autoPrice || null,
          price: autoPrice || null,
          distanceKm: routeInfo?.distanceKm || null,
          durationMinutes: routeInfo?.durationMinutes || null,
          distance_km: routeInfo?.distanceKm || null,
          duration_minutes: routeInfo?.durationMinutes || null,
          ...(scheduledForIso ? {
            scheduledFor: scheduledForIso,
            scheduledDisplay,
          } : {}),
          ...(driverMode === 'choose' && selectedDriver?.id
            ? { preferredDriverId: selectedDriver.id }
            : {}),
        }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok || !result?.ok) {
        throw new Error(result?.message || 'No se pudo encolar el viaje.');
      }

      let trip = result.trip;
      if (driverMode === 'choose' && selectedDriver?.id && trip?.id && !isScheduled) {
        try {
          const assigned = await assignExistingTripToDriver({
            tripId: trip.id,
            driverId: selectedDriver.id,
          });
          trip = assigned?.trip || trip;
        } catch (assignErr) {
          toast.warning(assignErr?.message || 'El viaje quedó en cola. Asignalo desde Viajes.');
        }
      }

      if (onSuccess) onSuccess(trip, { assignedDriver: driverMode === 'choose' ? selectedDriver : null });
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
                background: loading
                  ? '#CBD5E1'
                  : (isScheduled
                    ? 'linear-gradient(135deg,#1E293B 0%,#0F172A 100%)'
                    : 'linear-gradient(135deg,#EF4444 0%,#B91C1C 100%)'),
                border: 'none', borderRadius: 10, color: '#FFFFFF',
                fontSize: 13, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                boxShadow: loading
                  ? 'none'
                  : (isScheduled ? '0 4px 14px rgba(15,23,42,0.28)' : '0 4px 14px rgba(220,38,38,0.35)'),
              }}
            >
              {loading
                ? <><Spinner size={13} color="#fff" /> {isScheduled ? 'Programando…' : 'Encolando…'}</>
                : (isScheduled
                  ? <><CalendarIcon size={14} color="#FFFFFF" /> Programar viaje</>
                  : `🚖 ${enqueueActionLabel(driverMode, selectedDriver)}`)}
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
      className={asPopover
        ? 'fixed inset-0 z-[9999] flex items-stretch bg-navy-900/45 md:inset-auto md:bottom-[max(1rem,env(safe-area-inset-bottom))] md:left-auto md:right-4 md:top-auto md:block md:w-[min(440px,calc(100vw-2rem))] md:bg-transparent'
        : 'fixed inset-0 z-[9999] flex items-center justify-center bg-[rgba(15,23,42,0.65)] p-3 backdrop-blur-[6px]'}
      onClick={asPopover ? undefined : ((e) => e.target === e.currentTarget && onClose())}
    >
      <style>{MODAL_STYLES}</style>
      <div
        className={asPopover
          ? 'flex h-[100dvh] max-h-[100dvh] w-full flex-col overflow-hidden rounded-none bg-white md:h-auto md:max-h-[min(88vh,calc(100dvh-5.5rem))] md:rounded-[22px] md:border md:border-slate-200/85 md:bg-white/94 md:shadow-[0_18px_50px_rgba(15,23,42,0.16),0_2px_8px_rgba(15,23,42,0.06)]'
          : 'flex max-h-[min(92vh,100dvh)] w-full max-w-[520px] flex-col overflow-hidden rounded-[20px] bg-white shadow-[0_24px_64px_rgba(0,0,0,0.28)]'}
        style={{
          backdropFilter: asPopover ? 'blur(22px) saturate(1.4)' : undefined,
          WebkitBackdropFilter: asPopover ? 'blur(22px) saturate(1.4)' : undefined,
          animation: '_ntm_fade 0.18s ease',
        }}
      >
        {/* Header */}
        <div style={{
          padding: asPopover ? '12px 14px 10px' : '16px 20px',
          paddingTop: asPopover ? 'max(12px, env(safe-area-inset-top))' : 16,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%', background: '#E11D48', flexShrink: 0,
              boxShadow: '0 0 0 4px rgba(225,29,72,0.12)',
            }} />
            <div style={{ fontSize: asPopover ? 14 : 15, fontWeight: 600, color: '#0F172A', letterSpacing: '-0.02em' }}>
              {isScheduled ? 'Programar viaje' : 'Nuevo viaje'}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            style={{
              width: 40, height: 40, background: 'transparent', border: 'none',
              borderRadius: 10, color: '#94A3B8', fontSize: 18, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#334155'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#94A3B8'; }}
          >✕</button>
        </div>

        <form onSubmit={handleSubmit} style={{
          display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0,
        }}>
          <div ref={modalScrollRef} className="_ntm_scroll" style={{
            flex: 1, minHeight: 0, overflowY: 'auto',
            padding: asPopover ? '0 14px 8px' : '0 20px 12px',
          }}>
          {/* Inputs */}
          <div style={{
            background: '#F8FAFC', border: '1px solid #E8EEF4',
            borderRadius: 16, padding: '2px 0', marginBottom: 10,
          }}>
            {/* Recogida */}
            <div style={{ padding: asPopover ? '8px 12px' : '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <OriginDot />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em' }}>ORIGEN</span>
              </div>
              <AddressAutocomplete
                id="new-trip-pickup"
                placeholder="Ej: Belgrano 1200, Salta"
                value={pickupLabel}
                accentColor="#DC2626"
                inputIcon={<OriginDotSmall />}
                onChange={(text) => {
                  setPickupLabel(text);
                  setPickupLat(null);
                  setPickupLng(null);
                  setPlaceId('');
                  setPickupTitle('');
                  setPickupSubtitle('');
                  setPickupGeocodeSource(null);
                }}
                onSelect={onPickupSelect}
              />
              {pickupLat != null && pickupGeocodeSource && (
                <div style={{ marginTop: 4 }}>
                  <span
                    title={pickupGeocodeSource === 'supabase_cache' ? 'Coordenadas desde cache en base de datos' : 'Coordenadas desde Google Place Details Essentials'}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      padding: '2px 8px',
                      borderRadius: 999,
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.03em',
                      background: pickupGeocodeSource === 'supabase_cache' ? '#ECFDF5' : '#EFF6FF',
                      color: pickupGeocodeSource === 'supabase_cache' ? '#047857' : '#1D4ED8',
                    }}
                  >
                    {pickupGeocodeSource === 'supabase_cache' ? 'cache BD' : 'Google'}
                  </span>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', padding: '0 14px' }}>
              <div style={{ width: 1, height: 16, background: '#E2E8F0', marginLeft: 6 }} />
            </div>

            {/* Destino */}
            <div style={{ padding: asPopover ? '8px 12px 10px' : '10px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <DestDot />
                <span style={{ fontSize: 10, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.08em' }}>
                  DESTINO <span style={{ fontWeight: 500, color: '#CBD5E1' }}>opcional</span>
                </span>
              </div>
              <AddressAutocomplete
                id="new-trip-dest"
                placeholder="Ej: Av. San Martín 500, Salta"
                value={destLabel}
                accentColor="#059669"
                inputIcon={<DestDotSmall />}
                onChange={(text) => { setDestLabel(text); setDestLat(null); setDestLng(null); }}
                onSelect={(place) => {
                  const lat = Number(place?.lat);
                  const lng = Number(place?.lng);
                  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
                    setError('No se pudo ubicar el destino. Elegilo de nuevo de la lista.');
                    setDestLabel(''); setDestLat(null); setDestLng(null);
                    return;
                  }
                  if (!isWithinSaltaCapital(lat, lng)) {
                    setError('La dirección debe estar dentro de Salta Capital.');
                    setDestLabel(''); setDestLat(null); setDestLng(null);
                    return;
                  }
                  setDestLabel(place.formattedAddress);
                  setDestLat(lat);
                  setDestLng(lng);
                  setError('');
                }}
              />
              <p style={{ margin: '5px 0 0', fontSize: 10, color: '#94A3B8' }}>
                Vacío: el chofer lo define al subir.
              </p>
            </div>
          </div>

          <div
            role="group"
            aria-label="Cuándo sale el viaje"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 2,
              padding: 3,
              marginBottom: isScheduled ? 8 : 8,
              background: '#F1F5F9',
              borderRadius: 12,
            }}
          >
            <button
              type="button"
              aria-pressed={!isScheduled}
              onClick={() => setScheduledMode(false)}
              style={scheduleModeBtnStyle(!isScheduled, false)}
            >
              Ahora
            </button>
            <button
              type="button"
              aria-pressed={isScheduled}
              onClick={() => setScheduledMode(true)}
              style={scheduleModeBtnStyle(isScheduled, true)}
            >
              <CalendarIcon size={13} color={isScheduled ? '#FFFFFF' : '#64748B'} />
              Programar
            </button>
          </div>

          {isScheduled ? (
            <div
              ref={scheduleSectionRef}
              style={{
              background: '#FAFBFC',
              borderRadius: 14, padding: 10, marginBottom: 8,
            }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={scheduleFieldLabelStyle}>Día</label>
                  <ScheduleDatePicker value={scheduleDate} onChange={setScheduleDate} />
                </div>
                <div>
                  <label style={scheduleFieldLabelStyle}>Hora</label>
                  <ScheduleTimePicker value={scheduleTime} onChange={setScheduleTime} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 8 }}>
                <div>
                  <label style={scheduleFieldLabelStyle}>
                    Nombre <span style={{ fontWeight: 500, color: '#94A3B8' }}>opcional</span>
                  </label>
                  <input type="text" placeholder="Nombre" value={passengerName} onChange={(e) => setPassengerName(e.target.value)} style={optInputStyle} />
                </div>
                <div>
                  <label style={scheduleFieldLabelStyle}>
                    Teléfono <span style={{ fontWeight: 500, color: '#94A3B8' }}>opcional</span>
                  </label>
                  <input type="tel" placeholder="Ej: 3874001234" value={passengerPhone} onChange={(e) => setPassengerPhone(e.target.value)} style={optInputStyle} />
                </div>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: '#64748B', lineHeight: 1.45 }}>
                Se busca chofer {DEFAULT_SCHEDULED_DISPATCH_AHEAD_MS / 60000} minutos antes.
              </p>
            </div>
          ) : null}

          <div
            role="group"
            aria-label="Quién toma el viaje"
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 2,
              padding: 3,
              marginBottom: driverMode === 'choose' ? 8 : 8,
              background: '#F1F5F9',
              borderRadius: 12,
            }}
          >
            <button
              type="button"
              aria-pressed={driverMode === 'nearest'}
              onClick={() => { setDriverMode('nearest'); setDriverNumberQuery(''); }}
              style={scheduleModeBtnStyle(driverMode === 'nearest', false)}
            >
              Más cercano
            </button>
            <button
              type="button"
              aria-pressed={driverMode === 'choose'}
              onClick={() => setDriverMode('choose')}
              style={scheduleModeBtnStyle(driverMode === 'choose', true)}
            >
              Elegir chofer
            </button>
          </div>

          {driverMode === 'choose' ? (
            <div style={{
              background: '#FAFBFC',
              borderRadius: 14, padding: 10, marginBottom: 8,
            }}>
              <label style={scheduleFieldLabelStyle}>NÚMERO DE MÓVIL</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Ej: 12"
                value={driverNumberQuery}
                onChange={(e) => setDriverNumberQuery(e.target.value)}
                style={optInputStyle}
                onFocus={(e) => { e.target.style.borderColor = '#0F172A'; e.target.style.boxShadow = '0 0 0 3px rgba(15,23,42,0.08)'; }}
                onBlur={(e) => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }}
              />
              {!String(driverNumberQuery || '').trim() ? (
                <p style={{ margin: '8px 0 0', fontSize: 11, color: '#64748B', lineHeight: 1.45 }}>
                  Escribí el número de móvil para ver quién es y encolarlo a ese chofer.
                </p>
              ) : driverMatches.length === 0 ? (
                <p style={{ margin: '8px 0 0', fontSize: 11, color: '#DC2626' }}>
                  No hay un móvil con ese número.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {driverMatches.map((driver) => {
                    const availability = dashboardDriverAvailability(driver);
                    const selected = selectedDriverId === driver.id;
                    const vehicle = [driver.vehicleBrand, driver.vehicleModel].filter(Boolean).join(' ');
                    return (
                      <button
                        key={driver.id}
                        type="button"
                        onClick={() => setSelectedDriverId(driver.id)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '9px 11px',
                          borderRadius: 12,
                          border: selected ? '1.5px solid #0F172A' : '1px solid #E2E8F0',
                          background: selected ? '#FFFFFF' : '#F8FAFC',
                          boxShadow: selected ? '0 1px 3px rgba(15,23,42,0.08)' : 'none',
                          cursor: 'pointer',
                          fontFamily: 'inherit',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: '#0F172A' }}>
                            {driverDisplayName(driver)}
                          </span>
                          <span style={{
                            fontSize: 10, fontWeight: 700, letterSpacing: '0.03em',
                            padding: '3px 7px', borderRadius: 999,
                            background: availability.canAssign ? '#ECFDF5' : '#FEF2F2',
                            color: availability.canAssign ? '#047857' : '#B91C1C',
                          }}>
                            {availability.label}
                          </span>
                        </div>
                        <div style={{ marginTop: 3, fontSize: 11, color: '#64748B' }}>
                          Móvil #{driver.driverNumber}
                          {vehicle ? ` · ${vehicle}` : ''}
                          {driver.vehiclePlate ? ` · ${driver.vehiclePlate}` : ''}
                        </div>
                      </button>
                    );
                  })}
                  {isScheduled ? (
                    <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748B', lineHeight: 1.45 }}>
                      A la hora de despacho se ofrece primero a este móvil. Si no está libre, se busca el más cercano.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          ) : null}

          {/* Resumen de ruta, una línea */}
          {(routeLoading || routeInfo) ? (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', marginBottom: 8,
              background: '#FAFBFC', borderRadius: 12,
            }}>
              {routeLoading ? (
                <>
                  <Spinner size={13} color="#DC2626" />
                  <span style={{ fontSize: 12, color: '#94A3B8' }}>Calculando ruta…</span>
                </>
              ) : (
                <>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>{routeInfo.distanceKm} km</span>
                  <span style={{ color: '#E2E8F0' }}>·</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#0F172A' }}>{routeInfo.durationMinutes} min</span>
                  {autoPrice != null ? (
                    <>
                      <span style={{ color: '#E2E8F0' }}>·</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#DC2626' }}>
                        ${autoPrice.toLocaleString('es-AR')}
                      </span>
                    </>
                  ) : null}
                </>
              )}
            </div>
          ) : null}

          {/* Opcionales */}
          <button
            type="button"
            onClick={() => setShowOptional((v) => !v)}
            style={{
              width: '100%', marginBottom: showOptional ? 8 : 2,
              padding: '4px 2px', background: 'none', border: 'none',
              color: '#64748B', fontSize: 12, fontWeight: 600,
              cursor: 'pointer', textAlign: 'left',
              display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = '#0F172A'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = '#64748B'; }}
          >
            <span style={{ fontSize: 9, color: '#94A3B8' }}>{showOptional ? '▲' : '+'}</span>
            {showOptional ? 'Ocultar datos opcionales' : (isScheduled ? 'Agregar notas' : 'Pasajero, teléfono y notas')}
          </button>

          {showOptional && (
            <div style={{ marginBottom: 12 }}>
              {!isScheduled ? (
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
              ) : null}
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: '#64748B', marginBottom: 5, letterSpacing: '0.04em' }}>📝 NOTAS</label>
                <input type="text" placeholder="Instrucciones adicionales..." value={notes} onChange={(e) => setNotes(e.target.value)} style={optInputStyle}
                  onFocus={(e) => { e.target.style.borderColor = '#DC2626'; e.target.style.boxShadow = '0 0 0 3px rgba(220,38,38,0.1)'; }}
                  onBlur={(e) => { e.target.style.borderColor = '#E2E8F0'; e.target.style.boxShadow = 'none'; }}
                />
              </div>
            </div>
          )}

          </div>

          <div style={{
            flexShrink: 0,
            padding: asPopover ? '10px 14px 14px' : '12px 20px 18px',
            paddingBottom: asPopover
              ? 'max(14px, env(safe-area-inset-bottom))'
              : 18,
            borderTop: '1px solid #F1F5F9',
            background: asPopover
              ? 'linear-gradient(180deg, rgba(255,255,255,0.72), rgba(255,255,255,0.96))'
              : '#FFFFFF',
          }}>
            {error ? (
              <div style={{
                padding: '8px 10px', marginBottom: 8,
                background: '#FEF2F2', borderRadius: 10,
                color: '#DC2626', fontSize: 12, fontWeight: 500,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <span>⚠️</span> {error}
              </div>
            ) : null}
            <div style={{ display: 'flex', gap: 8, alignItems: 'stretch' }}>
              <button
                type="button" onClick={handleVerRuta}
                disabled={!canShowOnMap || routeLoading}
                aria-label="Ver en mapa"
                title={
                  !canShowOnMap
                    ? 'Confirmá la dirección de origen para verla en el mapa'
                    : (hasFullRoute ? 'Ver ruta en el mapa' : 'Ver punto de origen en el mapa')
                }
                style={{
                  width: 44, flexShrink: 0,
                  background: canShowOnMap ? '#F8FAFC' : '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  borderRadius: 12,
                  color: canShowOnMap ? '#0F172A' : '#CBD5E1',
                  cursor: canShowOnMap && !routeLoading ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {routeLoading
                  ? <Spinner size={14} color="#94A3B8" />
                  : <MapIcon size={18} color={canShowOnMap ? '#0F172A' : '#CBD5E1'} />}
              </button>
              <button
                type="submit" disabled={loading}
                style={{
                  flex: 1, padding: '12px 16px',
                  background: loading
                    ? '#CBD5E1'
                    : (isScheduled ? '#0F172A' : '#E11D48'),
                  border: 'none', borderRadius: 12, color: '#FFFFFF',
                  fontSize: 14, fontWeight: 700, fontFamily: 'inherit',
                  cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.75 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  boxShadow: loading
                    ? 'none'
                    : (isScheduled ? '0 6px 16px rgba(15,23,42,0.22)' : '0 6px 16px rgba(225,29,72,0.28)'),
                }}
              >
                {loading
                  ? <><Spinner size={14} color="#fff" /> {isScheduled ? 'Programando…' : 'Encolando…'}</>
                  : (isScheduled
                    ? <><CalendarIcon size={15} color="#FFFFFF" /> Programar viaje</>
                    : enqueueActionLabel(driverMode, selectedDriver))}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ── Sub-componentes ──────────────────────────────────────────────────────── */
function enqueueActionLabel(driverMode, selectedDriver) {
  if (driverMode === 'choose' && selectedDriver) {
    const n = Number(selectedDriver.driverNumber);
    return Number.isFinite(n) ? `Encolar a móvil #${n}` : 'Encolar a este chofer';
  }
  return 'Encolar viaje';
}

function CalendarIcon({ size = 14, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="3" stroke={color} strokeWidth="1.8" />
      <path d="M8 3.5v4M16 3.5v4M3.5 10h17" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function MapIcon({ size = 18, color = 'currentColor' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21s6.5-5.2 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5.8 6.5 11 6.5 11Z" stroke={color} strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="10" r="2.2" stroke={color} strokeWidth="1.7" />
    </svg>
  );
}

function scheduleModeBtnStyle(active, isScheduleTab) {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: '8px 8px',
    border: 'none',
    borderRadius: 9,
    background: active ? (isScheduleTab ? '#0F172A' : '#FFFFFF') : 'transparent',
    color: active ? (isScheduleTab ? '#FFFFFF' : '#0F172A') : '#64748B',
    fontSize: 12,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    boxShadow: active ? (isScheduleTab ? '0 2px 8px rgba(15,23,42,0.18)' : '0 1px 2px rgba(15,23,42,0.06)') : 'none',
    transition: 'background 0.15s ease, color 0.15s ease, box-shadow 0.15s ease',
  };
}

const scheduleFieldLabelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: '#64748B',
  marginBottom: 5,
  letterSpacing: '0.04em',
};

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

const optInputStyle = {
  width: '100%', padding: '9px 12px',
  background: '#FFFFFF', border: '1.5px solid #E2E8F0',
  borderRadius: 10, color: '#0F172A',
  fontSize: 13, outline: 'none', fontFamily: 'inherit',
  transition: 'border-color 0.15s, box-shadow 0.15s',
};
