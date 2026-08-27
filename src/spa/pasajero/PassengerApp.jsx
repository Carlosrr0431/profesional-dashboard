'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import AddressSearch from '../shared/AddressSearch';
import { spaJson, passengerHeaders, PASSENGER_CLIENT } from '../shared/api';
import {
  geocodePlace,
  reverseGeocode,
  fetchRouteMetrics,
  fetchRouteLine,
  isPickupCovered,
  newPlacesSessionToken,
  suggestionLabel,
} from '../shared/geo';
import { calculateTripPrice, formatArs, resolvePassengerTariff } from '../shared/money';
import { normalizePassengerPhone } from '../shared/phone';
import { clearPassengerSession, readPassengerSession, writePassengerSession } from '../shared/storage';
import { isOpenTripStatus, passengerStatusMeta } from '../shared/tripStatus';
import { PICKUP_OUTSIDE_COVERAGE_MESSAGE } from '../shared/coverage';
import { SpaBackHome, SpaBrand, SpaButton, SpaNotice, SpaTabs } from '../shared/ui';
import InstallAppButton from '../shared/InstallAppButton';
import { initInstallPrompt, registerSpaServiceWorker } from '../shared/pwa';

const SpaMap = dynamic(() => import('../shared/SpaMap'), { ssr: false });

const DEFAULT_CENTER = { longitude: -65.42, latitude: -24.78 };
const TABS = [
  { id: 'viaje', label: 'Viaje' },
  { id: 'historial', label: 'Historial' },
  { id: 'cuenta', label: 'Cuenta' },
];

function asMapCenter(point) {
  if (!point) return DEFAULT_CENTER;
  const lat = Number(point.lat ?? point.latitude);
  const lng = Number(point.lng ?? point.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return DEFAULT_CENTER;
  return { latitude: lat, longitude: lng };
}

export default function PassengerApp() {
  const [session, setSession] = useState(null);
  const [booting, setBooting] = useState(true);
  const [tab, setTab] = useState('viaje');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const [loginPhone, setLoginPhone] = useState('');
  const [loginName, setLoginName] = useState('');
  const [otp, setOtp] = useState('');
  const [otpStep, setOtpStep] = useState('phone');
  const [busy, setBusy] = useState(false);

  const [pickupText, setPickupText] = useState('');
  const [pickup, setPickup] = useState(null);
  const [destText, setDestText] = useState('');
  const [destination, setDestination] = useState(null);
  const [quote, setQuote] = useState(null);
  const [routeCoords, setRouteCoords] = useState(null);
  const [active, setActive] = useState(null);
  const [driver, setDriver] = useState(null);
  const [history, setHistory] = useState([]);
  const sessionTokenPlaces = useRef(newPlacesSessionToken());

  const persistSession = useCallback((next) => {
    writePassengerSession(next);
    setSession(next);
  }, []);

  useEffect(() => {
    initInstallPrompt();
    registerSpaServiceWorker('/pasajero');
  }, []);

  const loadTrips = useCallback(async (auth) => {
    const { ok, data } = await spaJson('/api/auth/passenger/trips', {
      method: 'POST',
      headers: passengerHeaders(),
      body: {
        phone: auth.phone,
        sessionToken: auth.sessionToken,
        client: PASSENGER_CLIENT,
      },
    });
    if (!ok || !data?.ok) {
      if (data?.message?.toLowerCase?.().includes('sesión')) {
        clearPassengerSession();
        setSession(null);
      }
      return;
    }
    setHistory(data.trips || []);
    if (data.activeTrip) setActive(data.activeTrip);
    else setActive((prev) => (prev && isOpenTripStatus(prev.status) ? prev : null));
    if (data.name && auth.name !== data.name) {
      persistSession({ ...auth, name: data.name });
    }
  }, [persistSession]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const stored = readPassengerSession();
      if (!stored) {
        setBooting(false);
        return;
      }
      const { ok, data } = await spaJson('/api/auth/passenger/validate-session', {
        method: 'POST',
        headers: passengerHeaders(),
        body: {
          phone: stored.phone,
          sessionToken: stored.sessionToken,
          client: PASSENGER_CLIENT,
        },
      });
      if (cancelled) return;
      if (!ok || !data?.ok) {
        clearPassengerSession();
        setBooting(false);
        return;
      }
      const next = {
        phone: data.phone,
        sessionToken: data.sessionToken,
        sessionExpiresAt: data.sessionExpiresAt,
        name: data.name || stored.name || '',
      };
      persistSession(next);
      await loadTrips(next);
      setBooting(false);
    })();
    return () => { cancelled = true; };
  }, [loadTrips, persistSession]);

  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const resolved = await reverseGeocode(lat, lng);
        const point = resolved || { address: 'Mi ubicación', lat, lng };
        setPickup(point);
        setPickupText(point.address || 'Mi ubicación');
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 },
    );
    return undefined;
  }, []);

  useEffect(() => {
    if (!pickup || !destination) {
      setQuote(null);
      setRouteCoords(null);
      return undefined;
    }
    let cancelled = false;
    (async () => {
      try {
        const [metrics, line, tariffRes] = await Promise.all([
          fetchRouteMetrics(pickup, destination),
          fetchRouteLine(pickup, destination),
          spaJson('/api/tariff-settings'),
        ]);
        if (cancelled) return;
        const tariff = resolvePassengerTariff(tariffRes.data?.data || {});
        const distanceKm = Number(metrics?.distanceKm);
        const durationMinutes = Number(metrics?.durationMinutes);
        const price = calculateTripPrice({ base: tariff.base, perKm: tariff.perKm, distanceKm });
        setQuote({
          distanceKm: Number.isFinite(distanceKm) ? distanceKm : null,
          durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : null,
          price,
        });
        setRouteCoords(line);
      } catch {
        if (!cancelled) setQuote(null);
      }
    })();
    return () => { cancelled = true; };
  }, [pickup, destination]);

  useEffect(() => {
    if (!active?.id || !isOpenTripStatus(active.status)) return undefined;
    let cancelled = false;
    const tick = async () => {
      const key = encodeURIComponent(active.tracking_token || active.id);
      const { ok, data } = await spaJson(`/api/public-tracking/${key}`);
      if (cancelled || !ok || !data?.ok) return;
      const trip = data.data.trip;
      setActive(trip);
      const track = data.data.lastTrack;
      const driverRow = data.data.driver;
      const lat = Number(track?.lat ?? driverRow?.current_lat);
      const lng = Number(track?.lng ?? driverRow?.current_lng);
      setDriver({
        ...driverRow,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        heading: Number(track?.heading) || 0,
      });
      if (!isOpenTripStatus(trip.status)) {
        if (session) loadTrips(session);
      }
    };
    tick();
    const id = setInterval(tick, 3500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active?.id, active?.status, active?.tracking_token, loadTrips, session]);

  const sendOtp = async (event) => {
    event.preventDefault();
    setError('');
    const phone = normalizePassengerPhone(loginPhone);
    if (!phone) {
      setError('Ingresá un teléfono válido de Argentina, con código de área.');
      return;
    }
    setBusy(true);
    const { ok, data } = await spaJson('/api/auth/passenger/send-otp', {
      method: 'POST',
      headers: passengerHeaders(),
      body: { phone, client: PASSENGER_CLIENT },
    });
    setBusy(false);
    if (!ok || !data?.ok) {
      setError(data?.message || 'No pudimos enviar el código.');
      return;
    }
    if (data.bypass && data.sessionToken) {
      persistSession({
        phone: data.phone,
        sessionToken: data.sessionToken,
        sessionExpiresAt: data.sessionExpiresAt,
        name: loginName.trim() || data.name || '',
      });
      return;
    }
    setOtpStep('code');
    setInfo(data.message || 'Te enviamos un código de 4 dígitos por WhatsApp.');
  };

  const verifyOtp = async (event) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    const { ok, data } = await spaJson('/api/auth/passenger/verify-otp', {
      method: 'POST',
      headers: passengerHeaders(),
      body: {
        phone: normalizePassengerPhone(loginPhone),
        code: otp,
        client: PASSENGER_CLIENT,
      },
    });
    setBusy(false);
    if (!ok || !data?.ok) {
      setError(data?.message || 'Código incorrecto o expirado.');
      return;
    }
    const next = {
      phone: data.phone,
      sessionToken: data.sessionToken,
      sessionExpiresAt: data.sessionExpiresAt,
      name: loginName.trim() || data.name || '',
    };
    persistSession(next);
    setOtp('');
    setOtpStep('phone');
    await loadTrips(next);
  };

  const selectPickup = async (hit) => {
    setError('');
    setPickupText(suggestionLabel(hit));
    try {
      const point = hit.lat != null
        ? {
          address: hit.formattedAddress || hit.title,
          lat: Number(hit.lat),
          lng: Number(hit.lng),
          placeId: hit.placeId || null,
        }
        : await geocodePlace({ ...hit, sessionToken: sessionTokenPlaces.current });
      setPickup(point);
      setPickupText(point.address);
    } catch (err) {
      setError(err.message || 'No se pudo ubicar el origen.');
    }
  };

  const selectDestination = async (hit) => {
    setError('');
    setDestText(suggestionLabel(hit));
    try {
      const point = hit.lat != null
        ? {
          address: hit.formattedAddress || hit.title,
          lat: Number(hit.lat),
          lng: Number(hit.lng),
          placeId: hit.placeId || null,
        }
        : await geocodePlace({ ...hit, sessionToken: sessionTokenPlaces.current });
      setDestination(point);
      setDestText(point.address);
    } catch (err) {
      setError(err.message || 'No se pudo ubicar el destino.');
    }
  };

  const requestTrip = async () => {
    if (!session || !pickup || !destination) return;
    setError('');
    setBusy(true);
    try {
      const covered = await isPickupCovered(pickup.lat, pickup.lng);
      if (!covered) {
        setError(PICKUP_OUTSIDE_COVERAGE_MESSAGE);
        setBusy(false);
        return;
      }
      const { ok, data } = await spaJson('/api/trips/create-queued', {
        method: 'POST',
        body: {
          source: 'passenger_app',
          pickupAddress: pickup.address,
          pickupLat: pickup.lat,
          pickupLng: pickup.lng,
          placeId: pickup.placeId || null,
          destinationAddress: destination.address,
          destinationLat: destination.lat,
          destinationLng: destination.lng,
          destinationPlaceId: destination.placeId || null,
          destinationHint: destination.address,
          passengerName: session.name || 'Pasajero',
          passengerPhone: session.phone,
          estimatedPrice: quote?.price ?? null,
          distanceKm: quote?.distanceKm ?? null,
          durationMinutes: quote?.durationMinutes ?? null,
        },
      });
      if (!ok || !data?.ok) {
        setError(data?.message || 'No se pudo pedir el viaje.');
        setBusy(false);
        return;
      }
      setActive(data.trip);
      setTab('viaje');
      sessionTokenPlaces.current = newPlacesSessionToken();
    } catch (err) {
      setError(err.message || 'No se pudo pedir el viaje.');
    } finally {
      setBusy(false);
    }
  };

  const cancelTrip = async () => {
    if (!active?.id) return;
    setBusy(true);
    const { ok, data } = await spaJson('/api/trips/cancel-passenger', {
      method: 'POST',
      body: { tripId: active.id },
    });
    setBusy(false);
    if (!ok || !data?.ok) {
      setError(data?.message || 'No se pudo cancelar.');
      return;
    }
    setActive(null);
    setDriver(null);
    if (session) loadTrips(session);
  };

  const logout = () => {
    clearPassengerSession();
    setSession(null);
    setActive(null);
    setHistory([]);
    setOtpStep('phone');
  };

  const status = passengerStatusMeta(active?.status);
  const mapCenter = asMapCenter(
    driver?.lat != null ? driver : pickup || { lat: DEFAULT_CENTER.latitude, lng: DEFAULT_CENTER.longitude },
  );

  if (booting) {
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#F4F7FC] text-sm text-slate-500">
        Cargando Profesional…
      </div>
    );
  }

  if (!session) {
    return (
      <div className="min-h-[100dvh] bg-[#F4F7FC] px-4 py-6">
        <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-6">
          <SpaBrand subtitle="App web de pasajeros · Salta Capital" />
          <div className="rounded-[1.6rem] bg-white p-5 shadow-[0_20px_50px_-28px_rgba(15,23,42,0.35)] ring-1 ring-black/[0.04]">
            <h1 className="text-xl font-bold text-navy-900">Pedí tu viaje</h1>
            <p className="mt-1 text-sm text-slate-500">Te enviamos un código por WhatsApp. Podés instalar esta app en el teléfono.</p>
            <form className="mt-5 grid gap-3" onSubmit={otpStep === 'phone' ? sendOtp : verifyOtp}>
              <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Nombre (opcional)
                <input
                  value={loginName}
                  onChange={(event) => setLoginName(event.target.value)}
                  className="h-12 rounded-2xl border border-light-300 px-4 text-sm font-medium text-navy-900"
                  placeholder="Cómo te llamás"
                />
              </label>
              <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Teléfono
                <input
                  value={loginPhone}
                  onChange={(event) => setLoginPhone(event.target.value)}
                  inputMode="tel"
                  className="h-12 rounded-2xl border border-light-300 px-4 text-sm font-medium text-navy-900"
                  placeholder="387 123 4567"
                />
              </label>
              {otpStep === 'code' ? (
                <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Código
                  <input
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 4))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    className="h-12 rounded-2xl border border-light-300 px-4 text-center text-lg font-bold tracking-[0.4em] text-navy-900"
                    placeholder="••••"
                  />
                </label>
              ) : null}
              {error ? <SpaNotice tone="error">{error}</SpaNotice> : null}
              {info ? <SpaNotice>{info}</SpaNotice> : null}
              <SpaButton type="submit" disabled={busy}>
                {busy ? 'Enviando…' : otpStep === 'phone' ? 'Enviar código' : 'Ingresar'}
              </SpaButton>
              {otpStep === 'code' ? (
                <button type="button" className="text-sm font-medium text-accent" onClick={() => setOtpStep('phone')}>
                  Cambiar número
                </button>
              ) : null}
            </form>
          </div>
          <InstallAppButton label="Instalar Profesional Pasajero" />
          <SpaBackHome />
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-[#E8EEF4]">
      <div className="absolute inset-0">
        <SpaMap
          center={mapCenter}
          pickup={pickup}
          dropoff={destination}
          driver={driver?.lat != null ? driver : null}
          routeCoords={routeCoords}
          followDriver={Boolean(driver?.lat && isOpenTripStatus(active?.status))}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto mx-auto flex max-w-lg items-center justify-between rounded-2xl bg-white/90 px-3 py-2 shadow-lg backdrop-blur">
          <SpaBrand subtitle={session.name || 'Pasajero'} />
          <SpaBackHome />
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto grid max-w-lg gap-3">
          <div className="max-h-[58vh] overflow-y-auto rounded-[1.6rem] bg-white/95 p-4 shadow-[0_24px_60px_-28px_rgba(15,23,42,0.45)] ring-1 ring-black/[0.05] backdrop-blur">
            {error ? <div className="mb-3"><SpaNotice tone="error">{error}</SpaNotice></div> : null}

            {tab === 'viaje' && active && isOpenTripStatus(active.status) ? (
              <div className="grid gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-accent">{status.label}</p>
                  <h2 className="text-lg font-bold text-navy-900">{status.desc}</h2>
                </div>
                {driver?.full_name ? (
                  <p className="text-sm text-slate-600">
                    {driver.full_name}
                    {driver.vehicle_plate ? ` · ${driver.vehicle_plate}` : ''}
                    {driver.vehicle_model ? ` · ${driver.vehicle_model}` : ''}
                  </p>
                ) : null}
                <p className="text-sm text-slate-600">
                  {active.origin_address}
                  {active.destination_address ? ` → ${active.destination_address}` : ''}
                </p>
                {status.canCancel ? (
                  <SpaButton variant="danger" disabled={busy} onClick={cancelTrip}>
                    Cancelar viaje
                  </SpaButton>
                ) : null}
              </div>
            ) : null}

            {tab === 'viaje' && (!active || !isOpenTripStatus(active.status)) ? (
              <div className="grid gap-3">
                <h2 className="text-lg font-bold text-navy-900">¿A dónde vas?</h2>
                <AddressSearch
                  label="Origen"
                  placeholder="Tu ubicación o una dirección"
                  value={pickupText}
                  onChangeText={setPickupText}
                  onSelect={selectPickup}
                  sessionToken={sessionTokenPlaces.current}
                />
                <AddressSearch
                  label="Destino"
                  placeholder="Elegí una sugerencia de Salta"
                  value={destText}
                  onChangeText={setDestText}
                  onSelect={selectDestination}
                  sessionToken={sessionTokenPlaces.current}
                />
                {quote?.price ? (
                  <div className="rounded-2xl bg-light-100 px-4 py-3">
                    <p className="text-2xl font-extrabold text-navy-900">{formatArs(quote.price)}</p>
                    <p className="text-xs text-slate-500">
                      {quote.distanceKm ? `${quote.distanceKm} km` : ''}
                      {quote.durationMinutes ? ` · ${quote.durationMinutes} min` : ''}
                    </p>
                  </div>
                ) : null}
                <SpaButton disabled={busy || !pickup || !destination} onClick={requestTrip}>
                  {busy ? 'Confirmando…' : 'Pedir móvil'}
                </SpaButton>
              </div>
            ) : null}

            {tab === 'historial' ? (
              <div className="grid gap-2">
                <h2 className="text-lg font-bold text-navy-900">Tus viajes</h2>
                {history.length === 0 ? (
                  <p className="text-sm text-slate-500">Todavía no tenés viajes.</p>
                ) : history.map((trip) => {
                  const meta = passengerStatusMeta(trip.status);
                  return (
                    <article key={trip.id} className="rounded-2xl border border-light-300 px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{meta.label}</p>
                      <p className="text-sm font-semibold text-navy-900">{trip.origin_address}</p>
                      <p className="text-sm text-slate-500">{trip.destination_address}</p>
                      {trip.price ? <p className="mt-1 text-sm font-bold">{formatArs(trip.price)}</p> : null}
                    </article>
                  );
                })}
              </div>
            ) : null}

            {tab === 'cuenta' ? (
              <div className="grid gap-3">
                <h2 className="text-lg font-bold text-navy-900">Tu cuenta</h2>
                <p className="text-sm text-slate-600">{session.phone}</p>
                <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Nombre
                  <input
                    value={session.name || ''}
                    onChange={(event) => persistSession({ ...session, name: event.target.value })}
                    className="h-12 rounded-2xl border border-light-300 px-4 text-sm font-medium text-navy-900"
                  />
                </label>
                <SpaButton variant="ghost" onClick={logout}>Cerrar sesión</SpaButton>
                <InstallAppButton label="Instalar Profesional Pasajero" />
              </div>
            ) : null}
          </div>
          <SpaTabs items={TABS} value={tab} onChange={setTab} />
        </div>
      </div>
    </div>
  );
}
