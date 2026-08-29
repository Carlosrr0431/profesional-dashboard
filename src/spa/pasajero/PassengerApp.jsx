'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { clearPassengerSession, readPassengerSession, writePassengerSession, readPassengerCredentialCache, writePassengerCredentialCache } from '../shared/storage';
import { isLiveNavTrip, isOpenTripStatus, passengerStatusMeta } from '../shared/tripStatus';
import { tripDropoffPoint, tripNavTarget, tripPickupPoint } from '../shared/tripPoints';
import { PICKUP_OUTSIDE_COVERAGE_MESSAGE } from '../shared/coverage';
import { SpaBackHome, SpaBrand, SpaButton, SpaEmpty, SpaNotice, SpaPanel, SpaSheet, SpaTabs, SpaTripRow, spaFieldClass } from '../shared/ui';
import { SpaAuthScreen, SpaBootScreen, SpaMapScreen } from '../shared/SpaShell';
import InstallAppButton from '../shared/InstallAppButton';
import LocationBanner from '../shared/LocationBanner';
import { useGeoPermission } from '../shared/geoPermission';
import { initInstallPrompt, registerSpaServiceWorker } from '../shared/pwa';
import TripLiveSheet from '../shared/TripLiveSheet';
import TripChatModal from '../shared/TripChatModal';
import { useSpaTripChat } from '../shared/useSpaTripChat';
import { useSpaConfirm } from '../shared/SpaConfirm';
import { buildTripTrackingUrl, isTripChatAvailable } from '../shared/tripChat';
import TripReviewSheet from './TripReviewSheet';
import ScheduleTripModal from './ScheduleTripModal';

const SpaMap = dynamic(() => import('../shared/SpaMap'), { ssr: false });

const DEFAULT_CENTER = { longitude: -65.42, latitude: -24.78 };
const TABS = [
  { id: 'viaje', label: 'Viaje', icon: 'map' },
  { id: 'historial', label: 'Viajes', icon: 'clock' },
  { id: 'cuenta', label: 'Cuenta', icon: 'user' },
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

  const [loginPhone, setLoginPhone] = useState(() => readPassengerCredentialCache()?.phone || '');
  const [loginName, setLoginName] = useState(() => readPassengerCredentialCache()?.name || '');
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
  const [originOpen, setOriginOpen] = useState(false);
  const [destOpen, setDestOpen] = useState(false);
  const [originFocused, setOriginFocused] = useState(false);
  const [destFocused, setDestFocused] = useState(false);
  const [editingRoute, setEditingRoute] = useState(true);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [chromeInsets, setChromeInsets] = useState({ top: 72, bottom: 280 });
  const sessionTokenPlaces = useRef(newPlacesSessionToken());
  const driverRef = useRef(null);
  const geo = useGeoPermission({ enabled: Boolean(session) });
  const tripChat = useSpaTripChat({
    role: 'passenger',
    tripId: active?.id,
    tripStatus: active?.status,
    enabled: Boolean(session && active?.id && isTripChatAvailable(active?.status)),
    passengerAuth: session
      ? { phone: session.phone, sessionToken: session.sessionToken }
      : null,
  });
  const { confirm, dialog: confirmDialog } = useSpaConfirm();

  const persistSession = useCallback((next) => {
    writePassengerSession(next);
    setSession(next);
  }, []);

  const onChromeInsets = useCallback((next) => {
    setChromeInsets((prev) => (
      prev.top === next.top && prev.bottom === next.bottom ? prev : next
    ));
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
    if (data.activeTrip) {
      setActive(data.activeTrip);
    } else {
      setActive(null);
      setDriver(null);
      driverRef.current = null;
    }
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
    if (!geo.coords || pickup) return undefined;
    let cancelled = false;
    (async () => {
      const resolved = await reverseGeocode(geo.coords.lat, geo.coords.lng);
      if (cancelled) return;
      const point = resolved || {
        address: 'Mi ubicación',
        lat: geo.coords.lat,
        lng: geo.coords.lng,
      };
      setPickup(point);
      setPickupText(point.address || 'Mi ubicación');
    })();
    return () => { cancelled = true; };
  }, [geo.coords, pickup]);

  useEffect(() => {
    if (isLiveNavTrip(active?.status)) return undefined;
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
  }, [pickup, destination, active?.status]);

  useEffect(() => {
    if (!active?.id || !isOpenTripStatus(active.status)) return undefined;
    let cancelled = false;
    const tick = async () => {
      const key = encodeURIComponent(active.tracking_token || active.id);
      const { ok, data } = await spaJson(`/api/public-tracking/${key}`);
      if (cancelled || !ok || !data?.ok) return;
      const trip = data.data.trip;
      if (!isOpenTripStatus(trip.status)) {
        setActive(null);
        setDriver(null);
        driverRef.current = null;
        setRouteCoords(null);
        setDestination(null);
        setDestText('');
        setQuote(null);
        if (session) loadTrips(session);
        return;
      }
      setActive(trip);
      const track = data.data.lastTrack;
      const driverRow = data.data.driver;
      const lat = Number(track?.lat ?? driverRow?.current_lat);
      const lng = Number(track?.lng ?? driverRow?.current_lng);
      const nextDriver = {
        ...driverRow,
        lat: Number.isFinite(lat) ? lat : null,
        lng: Number.isFinite(lng) ? lng : null,
        heading: Number(track?.heading) || 0,
      };
      driverRef.current = nextDriver;
      setDriver(nextDriver);
    };
    tick();
    const id = setInterval(tick, 3500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active?.id, active?.status, active?.tracking_token, loadTrips, session]);

  useEffect(() => {
    const trip = active;
    if (!trip?.id || !isLiveNavTrip(trip.status)) return undefined;

    let cancelled = false;
    const load = async () => {
      const loc = driverRef.current;
      const origin = loc?.lat != null && loc?.lng != null
        ? { lat: loc.lat, lng: loc.lng }
        : tripPickupPoint(trip);
      const target = tripNavTarget(trip);
      if (!origin || !target) return;
      const line = await fetchRouteLine(
        { lat: origin.lat, lng: origin.lng },
        { lat: target.lat, lng: target.lng },
      );
      if (!cancelled && line) setRouteCoords(line);
    };

    load();
    const id = setInterval(load, 20000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [active?.id, active?.status, active?.origin_lat, active?.destination_lat, driver?.lat != null]);

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
      const next = {
        phone: data.phone,
        sessionToken: data.sessionToken,
        sessionExpiresAt: data.sessionExpiresAt,
        name: loginName.trim() || data.name || '',
      };
      persistSession(next);
      writePassengerCredentialCache(next.name, next.phone);
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
    writePassengerCredentialCache(next.name, next.phone);
    setInfo('');
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
      if (destination) setEditingRoute(false);
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
      setOriginOpen(false);
      setDestOpen(false);
      setEditingRoute(false);
    } catch (err) {
      setError(err.message || 'No se pudo ubicar el destino.');
    }
  };

  const clearPreview = () => {
    setDestination(null);
    setDestText('');
    setQuote(null);
    setRouteCoords(null);
    setEditingRoute(true);
    setScheduleOpen(false);
  };

  const requestTrip = async ({ scheduledFor = null, scheduledDisplay = null } = {}) => {
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
          source: 'passenger_web',
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
          scheduledFor,
          scheduledDisplay,
        },
      });
      if (!ok || !data?.ok) {
        setError(data?.message || 'No se pudo pedir el viaje.');
        setBusy(false);
        return;
      }
      setScheduleOpen(false);
      if (data.trip?.status === 'scheduled' || scheduledFor) {
        setInfo(scheduledDisplay
          ? `Viaje programado para ${scheduledDisplay}.`
          : 'Viaje programado.');
        clearPreview();
        if (session) loadTrips(session);
      } else {
        setActive(data.trip);
        setTab('viaje');
        setEditingRoute(true);
      }
      sessionTokenPlaces.current = newPlacesSessionToken();
    } catch (err) {
      setError(err.message || 'No se pudo pedir el viaje.');
    } finally {
      setBusy(false);
    }
  };

  const cancelTrip = async () => {
    if (!active?.id) return;
    const searchingTrip = active.status === 'queued' || active.status === 'pending';
    const okConfirm = await confirm({
      title: searchingTrip ? '¿Cancelar la solicitud?' : '¿Cancelar este viaje?',
      amount: active.price ? formatArs(active.price) : null,
      body: searchingTrip
        ? 'Vamos a dejar de buscar un conductor.'
        : 'El chofer dejará de ver este viaje.',
      confirmLabel: searchingTrip ? 'Cancelar solicitud' : 'Cancelar viaje',
      cancelLabel: 'Seguir',
      tone: 'danger',
    });
    if (!okConfirm) return;
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
    driverRef.current = null;
    setRouteCoords(null);
    setDestination(null);
    setDestText('');
    setQuote(null);
    if (session) loadTrips(session);
  };

  const shareTrip = async () => {
    const url = buildTripTrackingUrl(active?.tracking_token || active?.id);
    if (!url) {
      setError('Falta el enlace de seguimiento del viaje.');
      return;
    }
    const message = `Seguí mi viaje en tiempo real:\n${url}`;
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: 'Compartir viaje', text: message, url });
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setInfo('Enlace de seguimiento copiado.');
      }
    } catch {
      // El usuario canceló el share nativo.
    }
  };

  const logout = () => {
    clearPassengerSession();
    setSession(null);
    setActive(null);
    setDriver(null);
    driverRef.current = null;
    setRouteCoords(null);
    setHistory([]);
    setOtpStep('phone');
  };

  const status = passengerStatusMeta(active?.status);
  const liveTrip = Boolean(active && isOpenTripStatus(active.status) && tab === 'viaje');
  const liveNav = Boolean(active && isLiveNavTrip(active.status));
  const reviewing = Boolean(
    tab === 'viaje'
    && pickup
    && destination
    && !editingRoute
    && (!active || !isOpenTripStatus(active.status))
  );
  const searching = !reviewing && !liveTrip && tab === 'viaje' && (originOpen || destOpen || originFocused || destFocused);
  const tripPickup = liveNav ? tripPickupPoint(active) : pickup;
  const tripDropoff = liveNav ? tripDropoffPoint(active) : destination;
  const inProgress = active?.status === 'in_progress';
  const chatReady = Boolean((active?.driver_id || driver?.id || driver?.full_name) && isTripChatAvailable(active?.status));
  const progressByStatus = {
    queued: 0.12,
    pending: 0.28,
    accepted: 0.5,
    going_to_pickup: 0.72,
    in_progress: 1,
  };
  const mapCenter = asMapCenter(
    liveNav && driver?.lat != null
      ? driver
      : pickup || { lat: DEFAULT_CENTER.latitude, lng: DEFAULT_CENTER.longitude },
  );

  if (booting) {
    return <SpaBootScreen>Cargando Profesional…</SpaBootScreen>;
  }

  if (!session) {
    return (
      <SpaAuthScreen>
          <SpaBrand subtitle="Pasajero · Salta" />
          <div className="spa-auth-card">
            <h1>Pedí tu viaje</h1>
            <p className="lead">Te enviamos un código por WhatsApp. Podés instalar esta app en el teléfono.</p>
            <form className="mt-6 grid gap-3" onSubmit={otpStep === 'phone' ? sendOtp : verifyOtp}>
              <label className="grid gap-1.5 text-[12px] font-medium text-slate-500">
                Nombre
                <input
                  value={loginName}
                  onChange={(event) => setLoginName(event.target.value)}
                  autoComplete="name"
                  className={spaFieldClass}
                  placeholder="Cómo te llamás"
                />
              </label>
              <label className="grid gap-1.5 text-[12px] font-medium text-slate-500">
                Teléfono
                <input
                  value={loginPhone}
                  onChange={(event) => setLoginPhone(event.target.value)}
                  inputMode="tel"
                  autoComplete="tel"
                  className={spaFieldClass}
                  placeholder="387 123 4567"
                />
              </label>
              {otpStep === 'code' ? (
                <label className="grid gap-1.5 text-[12px] font-medium text-slate-500">
                  Código de WhatsApp
                  <input
                    value={otp}
                    onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 4))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    enterKeyHint="done"
                    className={`${spaFieldClass} text-center text-lg font-semibold tracking-[0.45em]`}
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
      </SpaAuthScreen>
    );
  }

  const locationCopy = geo.status === 'unavailable'
    ? 'Este navegador no comparte ubicación. Escribí el origen a mano.'
    : geo.status === 'denied'
      ? 'Sin ubicación el origen queda a mano. Activá el permiso en la configuración del sitio o tocá Permitir otra vez.'
      : 'Activá la ubicación para completar el origen y pedir un móvil.';

  return (
    <SpaMapScreen
      expanded={searching}
      layoutKey={`${tab}:${reviewing ? 'review' : liveTrip ? 'live' : searching ? 'search' : 'idle'}`}
      onChromeInsets={onChromeInsets}
      overlay={(
        <>
          {confirmDialog}
          <ScheduleTripModal
            open={scheduleOpen}
            busy={busy}
            fareLabel={quote?.price != null ? formatArs(quote.price) : null}
            onClose={() => setScheduleOpen(false)}
            onConfirm={requestTrip}
          />
          <TripChatModal
            open={tripChat.chatOpen}
            title={driver?.full_name || 'Tu conductor'}
            subtitle="Chat del viaje"
            myRole={tripChat.myRole}
            messages={tripChat.messages}
            loading={tripChat.loading}
            sending={tripChat.sending}
            writable={tripChat.writable}
            onClose={tripChat.closeChat}
            onSendText={tripChat.sendText}
          />
        </>
      )}
      map={(
        <SpaMap
          center={mapCenter}
          pickup={inProgress ? null : tripPickup}
          dropoff={tripDropoff}
          driver={liveNav && driver?.lat != null ? driver : null}
          routeCoords={routeCoords}
          followDriver={Boolean(driver?.lat && liveNav)}
          fitToRoute={reviewing || (liveTrip && !liveNav)}
          fitPadding={chromeInsets}
        />
      )}
      header={searching ? null : (
        <div className="spa-card-bar">
          <SpaBrand subtitle={session.name || 'Pasajero'} />
          <SpaBackHome />
        </div>
      )}
      banner={!searching && geo.showBanner ? (
        <LocationBanner
          title="Ubicación desactivada"
          body={locationCopy}
          onAllow={geo.status === 'unavailable' ? undefined : geo.request}
        />
      ) : null}
      sheet={(
        <>
          <SpaSheet expanded={searching} compact={liveTrip} review={reviewing}>
            {error && !searching ? <SpaNotice tone="error">{error}</SpaNotice> : null}
            {info && (liveTrip || reviewing) ? <SpaNotice>{info}</SpaNotice> : null}

            {tab === 'viaje' && active && isOpenTripStatus(active.status) ? (
              <TripLiveSheet
                statusLabel={status.label}
                statusDesc={status.desc}
                progress={progressByStatus[active.status] || 0.5}
                personName={driver?.full_name || null}
                personMeta={[driver?.vehicle_model, driver?.vehicle_plate].filter(Boolean).join(' · ') || (driver?.full_name ? 'Conductor asignado' : null)}
                plate={driver?.vehicle_plate || null}
                pickup={active.origin_address}
                destination={active.destination_address}
                priceLabel={active.price ? formatArs(active.price) : null}
                canCancel={status.canCancel}
                cancelLabel={active.status === 'queued' || active.status === 'pending' ? 'Cancelar solicitud' : 'Cancelar viaje'}
                chatAvailable={chatReady}
                chatUnread={tripChat.unreadCount}
                onChat={chatReady ? tripChat.openChat : undefined}
                onShare={shareTrip}
                onSos={() => {
                  if (typeof window !== 'undefined') window.location.href = 'tel:911';
                }}
                onCancel={status.canCancel ? cancelTrip : undefined}
                busy={busy}
              />
            ) : null}

            {tab === 'viaje' && reviewing ? (
              <TripReviewSheet
                pickupAddress={pickup?.address}
                destinationAddress={destination?.address}
                quote={quote}
                busy={busy}
                onConfirm={() => requestTrip()}
                onSchedule={() => setScheduleOpen(true)}
                onEdit={() => setEditingRoute(true)}
                onCancel={clearPreview}
              />
            ) : null}

            {tab === 'viaje' && (!active || !isOpenTripStatus(active.status)) && !reviewing ? (
              <SpaPanel key="viaje-pedido" className={searching ? 'spa-panel--search' : ''}>
                {searching ? null : (
                  <h2 className="text-[22px] font-semibold tracking-tight text-navy-900">¿A dónde vas?</h2>
                )}
                {error && searching ? <SpaNotice tone="error">{error}</SpaNotice> : null}
                <div className={`spa-route${searching ? ' spa-route--search' : ''}`}>
                  <AddressSearch
                    stacked
                    tone="origin"
                    label="Origen"
                    placeholder="Punto de origen"
                    value={pickupText}
                    onChangeText={setPickupText}
                    onSelect={selectPickup}
                    sessionToken={sessionTokenPlaces.current}
                    onOpenChange={setOriginOpen}
                    onFocusChange={setOriginFocused}
                  />
                  <AddressSearch
                    stacked
                    tone="dest"
                    label="Destino"
                    placeholder="¿A dónde vas?"
                    value={destText}
                    onChangeText={(text) => {
                      setDestText(text);
                      setEditingRoute(true);
                    }}
                    onSelect={selectDestination}
                    sessionToken={sessionTokenPlaces.current}
                    onOpenChange={setDestOpen}
                    onFocusChange={setDestFocused}
                  />
                </div>
                {searching ? null : (
                  <SpaButton disabled={busy || !pickup || !destination} onClick={() => requestTrip()}>
                    {busy ? 'Confirmando…' : 'Pedir móvil'}
                  </SpaButton>
                )}
              </SpaPanel>
            ) : null}

            {tab === 'historial' ? (
              <SpaPanel key="historial">
                <h2 className="text-[22px] font-semibold tracking-tight text-navy-900">Tus viajes</h2>
                {history.length === 0 ? (
                  <SpaEmpty>Todavía no tenés viajes.</SpaEmpty>
                ) : (
                  <div>
                    {history.map((trip) => {
                      const meta = passengerStatusMeta(trip.status);
                      return (
                        <SpaTripRow
                          key={trip.id}
                          kicker={meta.label}
                          title={trip.origin_address}
                          subtitle={trip.destination_address}
                          meta={trip.price ? formatArs(trip.price) : null}
                        />
                      );
                    })}
                  </div>
                )}
              </SpaPanel>
            ) : null}

            {tab === 'cuenta' ? (
              <SpaPanel key="cuenta">
                <h2 className="text-[22px] font-semibold tracking-tight text-navy-900">Tu cuenta</h2>
                <p className="text-[15px] text-slate-500">{session.phone}</p>
                <label className="grid gap-1.5 text-[12px] font-medium text-slate-500">
                  Nombre
                  <input
                    value={session.name || ''}
                    onChange={(event) => persistSession({ ...session, name: event.target.value })}
                    autoComplete="name"
                    className={spaFieldClass}
                  />
                </label>
                <SpaButton variant="ghost" onClick={logout}>Cerrar sesión</SpaButton>
                <InstallAppButton label="Instalar Profesional Pasajero" />
              </SpaPanel>
            ) : null}
          </SpaSheet>
          {searching ? null : (
            <SpaTabs items={TABS} value={tab} onChange={setTab} compact={liveTrip || reviewing} />
          )}
        </>
      )}
    />
  );
}
