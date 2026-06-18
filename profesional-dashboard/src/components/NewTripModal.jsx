import { useState, useRef } from 'react';
import { formatError } from '../lib/errorFormat';
import { isWithinSaltaCapital } from '../lib/constants';
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

export default function NewTripModal({ onClose, onSuccess }) {
  const toast = useToast();
  const [pickupLabel, setPickupLabel] = useState('');
  const [pickupLat, setPickupLat] = useState(null);
  const [pickupLng, setPickupLng] = useState(null);
  const [placeId, setPlaceId] = useState('');
  const [passengerName, setPassengerName] = useState('');
  const [passengerPhone, setPassengerPhone] = useState('');
  const [destinationHint, setDestinationHint] = useState('');
  const [notes, setNotes] = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const pickupInputRef = useRef(null);

  const onPickupSelect = (place) => {
    const lat = Number(place?.lat);
    const lng = Number(place?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    if (!isWithinSaltaCapital(lat, lng)) {
      setError('La dirección debe estar dentro de Salta Capital.');
      setPickupLat(null);
      setPickupLng(null);
      setPlaceId('');
      setPickupLabel('');
      return;
    }

    const formatted = place.formattedAddress || '';
    setPickupLabel(formatted);
    setPickupLat(lat);
    setPickupLng(lng);
    setPlaceId(place.placeId || '');
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
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
          destinationHint: destinationHint.trim() || null,
          notes: notes.trim() || null,
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
              Nuevo viaje
            </h2>
            <p style={{ color: '#94A3B8', fontSize: '12px', margin: '2px 0 0' }}>
              Se encola y el sistema asigna chofer automáticamente
            </p>
          </div>
          <button
            type="button"
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

        <form onSubmit={handleSubmit} style={{ padding: '16px 20px' }}>
          <div style={{ marginBottom: '12px' }}>
            <AddressAutocomplete
              id="pickup-address"
              label="📍 RECOGIDA DEL PASAJERO"
              placeholder="Ej: Belgrano 1200, Salta"
              value={pickupLabel}
              onChange={(text) => {
                setPickupLabel(text);
                setPickupLat(null);
                setPickupLng(null);
                setPlaceId('');
              }}
              onSelect={onPickupSelect}
              required
            />
            <p style={{ color: '#64748B', fontSize: '11px', margin: '6px 0 0' }}>
              Solo direcciones dentro de Salta Capital. Elegí una sugerencia del listado.
            </p>
            {pickupLat != null && pickupLng != null && (
              <p style={{ color: '#059669', fontSize: '11px', margin: '4px 0 0' }}>
                Ubicación confirmada
              </p>
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
            {showOptional ? '− Ocultar detalles opcionales' : '+ Agregar detalles opcionales'}
          </button>

          {showOptional && (
            <>
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>🏁 DESTINO FINAL (opcional)</label>
                <input
                  type="text"
                  placeholder="Ej: Av. San Martín 500"
                  style={inputStyle}
                  value={destinationHint}
                  onChange={(e) => setDestinationHint(e.target.value)}
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
              {loading ? 'Encolando...' : '🚖 Encolar viaje'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
