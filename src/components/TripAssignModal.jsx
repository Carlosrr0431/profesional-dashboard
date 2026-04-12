import { useState, useRef, useCallback, useEffect } from 'react';
import { Autocomplete } from '@react-google-maps/api';
import { supabase } from '../lib/supabase';
import { sendPushNotification, formatPrice, formatKm } from '../lib/utils';

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  background: '#1C1C35',
  border: '1px solid #333360',
  borderRadius: '8px',
  color: '#fff',
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

export default function TripAssignModal({ driver, onClose, onSuccess, calculatePrice, tariffPerKm, tariffBase }) {
  const [originAddress, setOriginAddress] = useState('');
  const [originLat, setOriginLat] = useState(null);
  const [originLng, setOriginLng] = useState(null);
  const [destAddress, setDestAddress] = useState('');
  const [destLat, setDestLat] = useState(null);
  const [destLng, setDestLng] = useState(null);
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [originMode, setOriginMode] = useState('driver');
  const [routeInfo, setRouteInfo] = useState(null); // { distanceKm, durationMinutes }

  const originAutoRef = useRef(null);
  const destAutoRef = useRef(null);
  const originInputRef = useRef(null);
  const destInputRef = useRef(null);

  // Reverse geocode driver's current location for origin
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

  const reverseGeocode = async (lat, lng) => {
    try {
      const geocoder = new window.google.maps.Geocoder();
      const result = await geocoder.geocode({ location: { lat, lng } });
      if (result.results?.[0]) {
        return result.results[0].formatted_address;
      }
    } catch (e) {
      console.error('Reverse geocode error:', e);
    }
    return null;
  };

  const onOriginLoad = useCallback((auto) => {
    originAutoRef.current = auto;
  }, []);

  const onDestLoad = useCallback((auto) => {
    destAutoRef.current = auto;
  }, []);

  const onOriginChanged = () => {
    const place = originAutoRef.current?.getPlace();
    if (place?.geometry?.location) {
      const addr = place.formatted_address || place.name;
      setOriginAddress(addr);
      setOriginLat(place.geometry.location.lat());
      setOriginLng(place.geometry.location.lng());
      if (originInputRef.current) originInputRef.current.value = addr;
    }
  };

  const onDestChanged = () => {
    const place = destAutoRef.current?.getPlace();
    if (place?.geometry?.location) {
      const addr = place.formatted_address || place.name;
      setDestAddress(addr);
      setDestLat(place.geometry.location.lat());
      setDestLng(place.geometry.location.lng());
      if (destInputRef.current) destInputRef.current.value = addr;
    }
  };

  // Auto-calculate route when both coords available
  useEffect(() => {
    if (!originLat || !originLng || !destLat || !destLng) {
      setRouteInfo(null);
      return;
    }
    const calcRoute = async () => {
      try {
        const service = new window.google.maps.DirectionsService();
        const result = await service.route({
          origin: { lat: originLat, lng: originLng },
          destination: { lat: destLat, lng: destLng },
          travelMode: window.google.maps.TravelMode.DRIVING,
        });
        if (result.routes?.[0]?.legs?.[0]) {
          const leg = result.routes[0].legs[0];
          setRouteInfo({
            distanceKm: Math.round((leg.distance.value / 1000) * 10) / 10,
            durationMinutes: Math.round(leg.duration.value / 60),
          });
        }
      } catch (err) {
        console.warn('Route calc error:', err);
        setRouteInfo(null);
      }
    };
    calcRoute();
  }, [originLat, originLng, destLat, destLng]);

  const autoPrice = routeInfo ? calculatePrice(routeInfo.distanceKm) : null;

  // Geocode a text address to coordinates
  const geocodeAddress = async (address) => {
    try {
      const geocoder = new window.google.maps.Geocoder();
      const result = await geocoder.geocode({
        address: address + ', Salta, Argentina',
      });
      if (result.results?.[0]?.geometry?.location) {
        const loc = result.results[0].geometry.location;
        return {
          lat: loc.lat(),
          lng: loc.lng(),
          formatted: result.results[0].formatted_address,
        };
      }
    } catch (e) {
      console.error('Geocode error:', e);
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

    // Read current input values (uncontrolled inputs)
    const currentOriginText = originInputRef.current?.value || originAddress;
    const currentDestText = destInputRef.current?.value || destAddress;
    if (currentOriginText) setOriginAddress(currentOriginText);
    if (currentDestText) setDestAddress(currentDestText);

    // If origin is custom and user typed but didn't select autocomplete, geocode it
    if (originMode === 'custom' && currentOriginText && (!originLat || !originLng)) {
      const result = await geocodeAddress(currentOriginText);
      if (result) {
        setOriginLat(result.lat);
        setOriginLng(result.lng);
        setOriginAddress(result.formatted);
      } else {
        setError('No se pudo encontrar la dirección de origen. Probá con otra.');
        return;
      }
    }

    // If destination typed but no coords, geocode it
    if (currentDestText && (!destLat || !destLng)) {
      const result = await geocodeAddress(currentDestText);
      if (result) {
        setDestLat(result.lat);
        setDestLng(result.lng);
        setDestAddress(result.formatted);
      } else {
        setError('No se pudo encontrar la dirección de destino. Probá con otra.');
        return;
      }
    }

    if (!currentOriginText || !originLat || !originLng) {
      setError('Ingresá una dirección de origen');
      return;
    }
    if (!currentDestText) {
      setError('Ingresá una dirección de destino');
      return;
    }
    if (!passengerName.trim()) {
      setError('Ingresá el nombre del pasajero');
      return;
    }

    setLoading(true);

    try {
      // Use pre-calculated route info
      const distanceKm = routeInfo?.distanceKm || null;
      const durationMinutes = routeInfo?.durationMinutes || null;

      const tripData = {
        driver_id: driver.id,
        passenger_name: passengerName.trim(),
        passenger_phone: passengerPhone.trim() || null,
        origin_address: originAddress,
        origin_lat: originLat,
        origin_lng: originLng,
        destination_address: destAddress,
        destination_lat: destLat,
        destination_lng: destLng,
        status: 'pending',
        price: autoPrice || null,
        distance_km: distanceKm,
        duration_minutes: durationMinutes,
        notes: notes.trim() || null,
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
            body: `${passengerName.trim()} → ${destAddress}${distText}${priceText}`,
            data: {
              type: 'new_trip',
              tripId: data.id,
              trip: data,
            },
          });
        }
      } catch (pushErr) {
        console.warn('Push notification error (trip created successfully):', pushErr);
      }

      if (onSuccess) onSuccess(data);
      onClose();
    } catch (err) {
      console.error('Error creating trip:', err);
      setError(err.message || 'Error al crear el viaje');
    } finally {
      setLoading(false);
    }
  };

  const autocompleteOptions = {
    componentRestrictions: { country: 'ar' },
    fields: ['formatted_address', 'geometry', 'name'],
    bounds: {
      north: -24.65,
      south: -24.90,
      east: -65.30,
      west: -65.50,
    },
    strictBounds: false,
  };

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
          background: '#232345',
          borderRadius: '16px',
          width: '100%',
          maxWidth: '460px',
          maxHeight: '90vh',
          overflowY: 'auto',
          border: '1px solid #333360',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid #333360',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2 style={{ color: '#fff', fontSize: '16px', fontWeight: 700, margin: 0 }}>
              Asignar Viaje
            </h2>
            <p style={{ color: '#94A3B8', fontSize: '12px', margin: '2px 0 0' }}>
              Chofer: {driver?.fullName}
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: '#1C1C35',
              border: '1px solid #333360',
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
          {/* Origin */}
          <div style={{ marginBottom: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <label style={labelStyle}>📍 ORIGEN</label>
              <button
                type="button"
                onClick={() => setOriginMode(originMode === 'driver' ? 'custom' : 'driver')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8B83FF',
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
                  background: '#1C1C35',
                  color: '#A8A2FF',
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
              <Autocomplete
                onLoad={onOriginLoad}
                onPlaceChanged={onOriginChanged}
                options={autocompleteOptions}
              >
                <input
                  ref={originInputRef}
                  type="text"
                  placeholder="Ej: Belgrano 1200, Salta"
                  style={inputStyle}
                  onChange={() => { setOriginLat(null); setOriginLng(null); }}
                />
              </Autocomplete>
            )}
          </div>

          {/* Destination */}
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>🏁 DESTINO</label>
            <Autocomplete
              onLoad={onDestLoad}
              onPlaceChanged={onDestChanged}
              options={autocompleteOptions}
            >
              <input
                ref={destInputRef}
                type="text"
                placeholder="Ej: Av. San Martín 500, Salta"
                style={inputStyle}
                onChange={() => { setDestLat(null); setDestLng(null); }}
              />
            </Autocomplete>
          </div>

          {/* Passenger name & phone */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <label style={labelStyle}>👤 PASAJERO</label>
              <input
                type="text"
                placeholder="Nombre"
                style={inputStyle}
                value={passengerName}
                onChange={(e) => setPassengerName(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={labelStyle}>📞 TELÉFONO</label>
              <input
                type="tel"
                placeholder="Ej: 3874001234"
                style={inputStyle}
                value={passengerPhone}
                onChange={(e) => setPassengerPhone(e.target.value)}
              />
            </div>
          </div>

          {/* Route info & Price */}
          {routeInfo && (
            <div
              style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '12px',
                padding: '12px',
                background: 'rgba(139,131,255,0.06)',
                border: '1px solid rgba(139,131,255,0.15)',
                borderRadius: '10px',
              }}
            >
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ color: '#94A3B8', fontSize: '10px', fontWeight: 600, marginBottom: '2px' }}>DISTANCIA</div>
                <div style={{ color: '#fff', fontSize: '15px', fontWeight: 700 }}>{routeInfo.distanceKm} km</div>
              </div>
              <div style={{ width: '1px', background: 'rgba(139,131,255,0.2)' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ color: '#94A3B8', fontSize: '10px', fontWeight: 600, marginBottom: '2px' }}>TIEMPO</div>
                <div style={{ color: '#fff', fontSize: '15px', fontWeight: 700 }}>{routeInfo.durationMinutes} min</div>
              </div>
              <div style={{ width: '1px', background: 'rgba(139,131,255,0.2)' }} />
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ color: '#94A3B8', fontSize: '10px', fontWeight: 600, marginBottom: '2px' }}>PRECIO</div>
                <div style={{ color: '#00E6B8', fontSize: '18px', fontWeight: 700 }}>
                  ${autoPrice?.toLocaleString('es-AR') || '—'}
                </div>
                <div style={{ color: '#64748B', fontSize: '9px', marginTop: '1px' }}>
                  {tariffBase > 0 ? `$${tariffBase} + ` : ''}${tariffPerKm}/km
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div style={{ marginBottom: '12px' }}>
            <label style={labelStyle}>📝 NOTAS</label>
            <input
              type="text"
              placeholder="Instrucciones adicionales..."
              style={inputStyle}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

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
                background: '#1C1C35',
                border: '1px solid #333360',
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
                background: loading ? '#4a4a80' : 'linear-gradient(135deg, #8B83FF, #6C63FF)',
                border: 'none',
                borderRadius: '10px',
                color: '#fff',
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
