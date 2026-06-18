import { useState, useRef, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { sendPushNotification, formatPrice, formatKm } from '../lib/utils';
import { formatError } from '../lib/errorFormat';
import { isWithinSaltaCapital } from '../lib/constants';
import { buildDashboardAssignNotes } from '../lib/tripRequeue';
import { useToast } from '../context/ToastContext';
import AddressAutocomplete from './AddressAutocomplete';

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  background: '#F1F3F8',
  border: '1px solid #E2E8F0',
  borderRadius: '8px',
  color: '#0F172A',
  fontSize: '13px',
  outline: 'none',
  fontFamily: 'inherit',
};

const labelStyle = {
  display: 'block',
  fontSize: '11px',
  color: '#94A3B8',
  marginBottom: '4px',
  fontWeight: 600,
};

export default function TripAssignModal({ driver, onClose, onSuccess, calculatePrice, tariffPerKm, tariffBase, commissionPercent }) {
  const toast = useToast();
  const [originAddress, setOriginAddress] = useState('');
  const [originLat, setOriginLat] = useState(null);
  const [originLng, setOriginLng] = useState(null);
  const [destAddress, setDestAddress] = useState('');
  const [destLat, setDestLat] = useState(null);
  const [destLng, setDestLng] = useState(null);
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [originMode, setOriginMode] = useState('custom');
  const [routeInfo, setRouteInfo] = useState(null); // { distanceKm, durationMinutes }

  const reverseGeocode = async (lat, lng) => {
    try {
      const response = await fetch(`/api/geo/reverse?lat=${lat}&lng=${lng}`);
      const payload = await response.json();
      if (payload?.ok) return payload.data?.formattedAddress;
    } catch (e) {
      console.error('Reverse geocode error:', formatError(e));
    }
    return null;
  };

  const onOriginSelect = (place) => {
    const addr = place.formattedAddress || '';
    setOriginAddress(addr);
    setOriginLat(place.lat);
    setOriginLng(place.lng);
  };

  const onDestSelect = (place) => {
    const addr = place.formattedAddress || '';
    setDestAddress(addr);
    setDestLat(place.lat);
    setDestLng(place.lng);
  };

  useEffect(() => {
    if (driver && originMode === 'driver') {
      const lat = parseFloat(driver.lat);
      const lng = parseFloat(driver.lng);
      if (!lat || !lng || (lat === 0 && lng === 0)) {
        setOriginAddress('Ubicación no disponible');
        setOriginLat(null);
        setOriginLng(null);
        return;
      }
      setOriginLat(lat);
      setOriginLng(lng);
      reverseGeocode(lat, lng).then((addr) => {
        setOriginAddress(addr || `${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      });
    }
  }, [driver, originMode]);

  // Auto-calculate route when both coords available
  useEffect(() => {
    if (!originLat || !originLng || !destLat || !destLng) {
      setRouteInfo(null);
      return;
    }
    const calcRoute = async () => {
      try {
        const url = `/api/geo/route-metrics?originLat=${originLat}&originLng=${originLng}&destLat=${destLat}&destLng=${destLng}`;
        const response = await fetch(url);
        const payload = await response.json();
        if (payload?.ok && payload.data?.distanceKm != null) {
          setRouteInfo(payload.data);
        } else {
          setRouteInfo(null);
        }
      } catch (err) {
        console.warn('Route calc error:', err);
        setRouteInfo(null);
      }
    };
    calcRoute();
  }, [originLat, originLng, destLat, destLng]);

  const autoPrice = routeInfo ? calculatePrice(routeInfo.distanceKm) : null;
  const autoCommission = autoPrice ? Math.round(autoPrice * (commissionPercent || 10) / 100) : null;

  const geocodeAddress = async (address) => {
    try {
      const response = await fetch(`/api/geo/geocode?address=${encodeURIComponent(`${address}, Salta, Argentina`)}`);
      const payload = await response.json();
      if (payload?.ok) {
        return {
          lat: payload.data.lat,
          lng: payload.data.lng,
          formatted: payload.data.formattedAddress,
        };
      }
    } catch (e) {
      console.error('Geocode error:', formatError(e));
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // If origin is driver mode but no coords, block
    if (originMode === 'driver' && (!originLat || !originLng)) {
      setError('El chofer no tiene ubicación disponible. Cambiá a dirección manual.');
      return;
    }

    const currentOriginText = originAddress;
    const currentDestText = destAddress;
    if (currentOriginText) setOriginAddress(currentOriginText);
    if (currentDestText) setDestAddress(currentDestText);

    let finalOriginAddress = currentOriginText || originAddress;
    let finalOriginLat = originLat;
    let finalOriginLng = originLng;
    let finalDestAddress = currentDestText.trim();
    let finalDestLat = destLat;
    let finalDestLng = destLng;

    // If origin is custom and user typed but didn't select autocomplete, geocode it
    if (originMode === 'custom' && currentOriginText && (!finalOriginLat || !finalOriginLng)) {
      const result = await geocodeAddress(currentOriginText);
      if (result) {
        finalOriginLat = result.lat;
        finalOriginLng = result.lng;
        finalOriginAddress = result.formatted;
        setOriginLat(result.lat);
        setOriginLng(result.lng);
        setOriginAddress(result.formatted);
      } else {
        setError('No se pudo encontrar la dirección de origen. Probá con otra.');
        return;
      }
    }

    // If destination typed but no coords, geocode it
    if (finalDestAddress && (!finalDestLat || !finalDestLng)) {
      const result = await geocodeAddress(finalDestAddress);
      if (result) {
        finalDestLat = result.lat;
        finalDestLng = result.lng;
        finalDestAddress = result.formatted;
        setDestLat(result.lat);
        setDestLng(result.lng);
        setDestAddress(result.formatted);
      } else {
        setError('No se pudo encontrar la dirección de destino. Probá con otra.');
        return;
      }
    }

    if (!finalOriginAddress || !finalOriginLat || !finalOriginLng) {
      setError('Ingresá la dirección de recogida del pasajero');
      return;
    }

    const resolvedPassengerName = passengerName.trim() || 'Pasajero';
    const resolvedDestAddress = finalDestAddress || 'A confirmar';

    setLoading(true);

    try {
      // Use pre-calculated route info
      const distanceKm = routeInfo?.distanceKm || null;
      const durationMinutes = routeInfo?.durationMinutes || null;

      const driverLat = parseFloat(driver?.lat);
      const driverLng = parseFloat(driver?.lng);
      const hasDriverCoords =
        Number.isFinite(driverLat)
        && Number.isFinite(driverLng)
        && !(driverLat === 0 && driverLng === 0);

      const tripNotes = buildDashboardAssignNotes({
        userNotes: notes.trim(),
        dropoffAddress: resolvedDestAddress,
        dropoffLat: finalDestLat,
        dropoffLng: finalDestLng,
      });

      const tripData = {
        driver_id: driver.id,
        passenger_name: resolvedPassengerName,
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
        distance_km: distanceKm,
        duration_minutes: durationMinutes,
        notes: tripNotes,
        wa_context: { dispatch_excluded_driver_ids: [] },
      };

      const { data, error: insertError } = await supabase
        .from('trips')
        .insert(tripData)
        .select()
        .single();

      if (insertError) throw insertError;

      // Send push notification to driver's device
      try {
        const { data: driverData } = await supabase
          .from('drivers')
          .select('push_token, full_name')
          .eq('id', driver.id)
          .single();

        if (driverData?.push_token) {
          const priceText = data.price ? ` · ${formatPrice(data.price)}` : '';
          const distText = data.distance_km ? ` · ${formatKm(data.distance_km)}` : '';
          await sendPushNotification(driverData.push_token, {
            title: `Nuevo viaje asignado`,
            body: `${resolvedPassengerName} → ${finalOriginAddress}${distText}${priceText}`,
            data: {
              type: 'new_trip',
              tripId: data.id,
              trip: data,
            },
            driverId: driver.id,
          });
        }
      } catch (pushErr) {
        console.warn('Push notification error (trip created successfully):', pushErr);
        toast.warning('Viaje creado, pero no se pudo enviar la notificación al chofer');
      }

      if (onSuccess) onSuccess(data);
      onClose();
    } catch (err) {
      console.error('Error creating trip:', formatError(err));
      const message = err.message || 'Error al crear el viaje';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const autocompleteOptions = SALTA_CAPITAL_AUTOCOMPLETE_OPTIONS;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '460px',
          maxHeight: '90vh',
          overflowY: 'auto',
          border: '1px solid #E2E8F0',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #E2E8F0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ color: '#0F172A', fontSize: '16px', fontWeight: 700, margin: 0 }}>
              Asignar Viaje
            </h2>
            <p style={{ color: '#94A3B8', fontSize: '12px', margin: '2px 0 0' }}>
              Chofer: {driver?.fullName}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#F1F3F8',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              color: '#94A3B8',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: '16px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '16px 20px' }}>
          {/* Origin — único campo obligatorio */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={labelStyle}>📍 RECOGIDA DEL PASAJERO</label>
              <button
                type="button"
                onClick={() => setOriginMode(originMode === 'driver' ? 'custom' : 'driver')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#DC2626',
                  fontSize: '10px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {originMode === 'driver' ? 'Cambiar dirección' : 'Usar ubicación del chofer'}
              </button>
            </div>
            {originMode === 'driver' ? (
              <div
                style={{
                  ...inputStyle,
                  background: '#F1F3F8',
                  color: '#EF4444',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                }}
              >
                <span style={{ fontSize: '14px' }}>📍</span>
                <span style={{ fontSize: '12px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {originAddress || 'Obteniendo ubicación...'}
                </span>
              </div>
            ) : (
              <AddressAutocomplete
                id="assign-origin"
                placeholder="Ej: Belgrano 1200, Salta"
                value={originAddress}
                onChange={(text) => {
                  setOriginAddress(text);
                  setOriginLat(null);
                  setOriginLng(null);
                }}
                onSelect={onOriginSelect}
              />
            )}
          </div>

          <button
            type="button"
            onClick={() => setShowOptional((prev) => !prev)}
            style={{
              width: '100%',
              marginBottom: showOptional ? '12px' : '4px',
              padding: '8px 0',
              background: 'none',
              border: 'none',
              color: '#64748B',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {showOptional ? '− Ocultar detalles opcionales' : '+ Agregar detalles opcionales (destino, pasajero, notas)'}
          </button>

          {showOptional && (
            <>
              <div style={{ marginBottom: '12px' }}>
                <AddressAutocomplete
                  id="assign-dest"
                  label="🏁 DESTINO (opcional)"
                  placeholder="Ej: Av. San Martín 500, Salta"
                  value={destAddress}
                  onChange={(text) => {
                    setDestAddress(text);
                    setDestLat(null);
                    setDestLng(null);
                  }}
                  onSelect={onDestSelect}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                <div>
                  <label style={labelStyle}>👤 PASAJERO (opcional)</label>
                  <input
                    type="text"
                    placeholder="Nombre"
                    style={inputStyle}
                    value={passengerName}
                    onChange={(e) => setPassengerName(e.target.value)}
                  />
                </div>
                <div>
                  <label style={labelStyle}>📞 TELÉFONO (opcional)</label>
                  <input
                    type="tel"
                    placeholder="Ej: 3874001234"
                    style={inputStyle}
                    value={passengerPhone}
                    onChange={(e) => setPassengerPhone(e.target.value)}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>📝 NOTAS (opcional)</label>
                <input
                  type="text"
                  placeholder="Instrucciones adicionales..."
                  style={inputStyle}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </>
          )}

          {/* Route info & Price */}
          {routeInfo && (
            <div
              style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '12px',
                padding: '12px',
                background: 'rgba(220,38,38,0.06)',
                border: '1px solid rgba(220,38,38,0.15)',
                borderRadius: '10px',
              }}
            >
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ color: '#94A3B8', fontSize: '10px', fontWeight: 600, marginBottom: '2px' }}>DISTANCIA</div>
                <div style={{ color: '#0F172A', fontSize: '15px', fontWeight: 700 }}>{routeInfo.distanceKm} km</div>
              </div>
              <div style={{ width: '1px', background: 'rgba(220,38,38,0.2)' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ color: '#94A3B8', fontSize: '10px', fontWeight: 600, marginBottom: '2px' }}>TIEMPO</div>
                <div style={{ color: '#0F172A', fontSize: '15px', fontWeight: 700 }}>{routeInfo.durationMinutes} min</div>
              </div>
              <div style={{ width: '1px', background: 'rgba(220,38,38,0.2)' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ color: '#94A3B8', fontSize: '10px', fontWeight: 600, marginBottom: '2px' }}>PRECIO</div>
                <div style={{ color: '#00E6B8', fontSize: '18px', fontWeight: 700 }}>
                  ${autoPrice?.toLocaleString('es-AR') || '—'}
                </div>
                <div style={{ color: '#64748B', fontSize: '9px', marginTop: '1px' }}>
                  {tariffBase > 0 ? `$${tariffBase} + ` : ''}${tariffPerKm}/km
                </div>
              </div>
              {autoCommission > 0 && (
                <>
                  <div style={{ width: '1px', background: 'rgba(220,38,38,0.2)' }} />
                  <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ color: '#94A3B8', fontSize: '10px', fontWeight: 600, marginBottom: '2px' }}>COMISIÓN</div>
                    <div style={{ color: '#F59E0B', fontSize: '15px', fontWeight: 700 }}>
                      ${autoCommission?.toLocaleString('es-AR') || '—'}
                    </div>
                    <div style={{ color: '#64748B', fontSize: '9px', marginTop: '1px' }}>
                      {commissionPercent}%
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Error */}
          {error && (
            <div
              style={{
                padding: '8px 12px',
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '8px',
                color: '#EF4444',
                fontSize: '12px',
                marginBottom: '12px',
              }}
            >
              {error}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1,
                padding: '10px',
                background: '#F1F3F8',
                border: '1px solid #E2E8F0',
                borderRadius: '10px',
                color: '#94A3B8',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              style={{
                flex: 2,
                padding: '10px',
                background: loading ? '#CBD5E1' : 'linear-gradient(135deg, #EF4444, #DC2626)',
                border: 'none',
                borderRadius: '10px',
                color: '#FFFFFF',
                fontSize: '13px',
                fontWeight: 700,
                cursor: loading ? 'not-allowed' : 'pointer',
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? 'Asignando...' : '🚖 Asignar Viaje'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
