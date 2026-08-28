'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { getDriverSupabase } from './driverSupabase';
import { spaJson } from '../shared/api';
import { fetchRouteLine } from '../shared/geo';
import { formatArs } from '../shared/money';
import { normalizeDriverPhone } from '../shared/phone';
import { DRIVER_STATUS, isOpenTripStatus } from '../shared/tripStatus';
import { tripDropoffPoint, tripNavTarget, tripPickupPoint } from '../shared/tripPoints';
import { SpaBackHome, SpaBrand, SpaButton, SpaEmpty, SpaKicker, SpaNotice, SpaPanel, SpaSheet, SpaSwitch, SpaTabs, SpaTripRow, haptic, spaFieldClass } from '../shared/ui';
import { SpaAuthScreen, SpaBootScreen, SpaMapScreen } from '../shared/SpaShell';
import InstallAppButton from '../shared/InstallAppButton';
import LocationBanner from '../shared/LocationBanner';
import { initInstallPrompt, registerSpaServiceWorker } from '../shared/pwa';
import { useDriverGps } from './useDriverGps';
import TripLiveSheet from '../shared/TripLiveSheet';
import TripChatModal from '../shared/TripChatModal';
import { useSpaTripChat } from '../shared/useSpaTripChat';
import { useSpaConfirm } from '../shared/SpaConfirm';
import { isTripChatAvailable } from '../shared/tripChat';
import NewTripOffer from './NewTripOffer';
import { unlockOfferAlert } from './offerAlert';

const SpaMap = dynamic(() => import('../shared/SpaMap'), { ssr: false });

const TABS = [
  { id: 'inicio', label: 'Inicio', icon: 'home' },
  { id: 'historial', label: 'Viajes', icon: 'clock' },
  { id: 'cuenta', label: 'Cuenta', icon: 'user' },
];

const DEFAULT_CENTER = { latitude: -24.78, longitude: -65.42 };

export default function DriverApp() {
  const [booting, setBooting] = useState(true);
  const [driver, setDriver] = useState(null);
  const [tab, setTab] = useState('inicio');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [driverNumber, setDriverNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [lookup, setLookup] = useState(null);
  const [choices, setChoices] = useState([]);

  const [online, setOnline] = useState(false);
  const [pendingTrip, setPendingTrip] = useState(null);
  const [activeTrip, setActiveTrip] = useState(null);
  const [history, setHistory] = useState([]);
  const [routeCoords, setRouteCoords] = useState(null);
  const readyHaptic = useRef(false);
  const locationRef = useRef(null);
  const geo = useDriverGps(driver?.id);
  const location = geo.coords;
  locationRef.current = location;
  const hasFix = Boolean(location);
  const tripChat = useSpaTripChat({
    role: 'driver',
    tripId: activeTrip?.id,
    tripStatus: activeTrip?.status,
    enabled: Boolean(driver && activeTrip?.id && isTripChatAvailable(activeTrip?.status)),
    getSupabase: getDriverSupabase,
  });
  const { confirm, dialog: confirmDialog } = useSpaConfirm();

  const fetchProfile = useCallback(async (userId) => {
    const supabase = getDriverSupabase();
    const { data, error: profileError } = await supabase
      .from('drivers')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();
    if (profileError) throw profileError;
    return data;
  }, []);

  const loadHistory = useCallback(async (driverId) => {
    const supabase = getDriverSupabase();
    const { data } = await supabase
      .from('trips')
      .select('id, status, passenger_name, destination_address, origin_address, price, created_at, completed_at')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })
      .limit(30);
    setHistory(data || []);
  }, []);

  const loadOpenTrip = useCallback(async (driverId) => {
    const supabase = getDriverSupabase();
    const { data } = await supabase
      .from('trips')
      .select('*')
      .eq('driver_id', driverId)
      .in('status', ['pending', 'accepted', 'going_to_pickup', 'in_progress'])
      .order('created_at', { ascending: false })
      .limit(5);
    const rows = data || [];
    const pending = rows.find((row) => row.status === 'pending') || null;
    const active = rows.find((row) => row.status !== 'pending') || null;
    setPendingTrip(pending);
    setActiveTrip(active);
  }, []);

  useEffect(() => {
    initInstallPrompt();
    registerSpaServiceWorker('/conductor');
    const unlock = () => unlockOfferAlert();
    window.addEventListener('pointerdown', unlock);
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const supabase = getDriverSupabase();
        const { data } = await supabase.auth.getSession();
        const userId = data.session?.user?.id;
        if (!userId) {
          setBooting(false);
          return;
        }
        const profile = await fetchProfile(userId);
        if (cancelled) return;
        if (!profile) {
          await supabase.auth.signOut();
          setBooting(false);
          return;
        }
        setDriver(profile);
        setOnline(Boolean(profile.is_available));
        await Promise.all([loadOpenTrip(profile.id), loadHistory(profile.id)]);
      } catch (err) {
        setError(err.message || 'No se pudo restaurar la sesión.');
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchProfile, loadHistory, loadOpenTrip]);

  const syncLocation = useCallback(async (coords, isOnline) => {
    if (!driver?.id || !coords) return;
    const supabase = getDriverSupabase();
    const lat = coords.lat;
    const lng = coords.lng;
    await Promise.all([
      supabase.from('driver_locations').upsert({
        driver_id: driver.id,
        is_online: isOnline,
        lat,
        lng,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'driver_id' }),
      supabase.from('drivers').update({
        current_lat: lat,
        current_lng: lng,
      }).eq('id', driver.id),
    ]);
  }, [driver?.id]);

  useEffect(() => {
    if (!geo.simReady || geo.simulating) return;
    if (!online || !location) return;
    syncLocation(location, true);
  }, [online, location, syncLocation, geo.simReady, geo.simulating]);

  useEffect(() => {
    if (!readyHaptic.current) {
      readyHaptic.current = true;
      return;
    }
    if (pendingTrip?.id && !activeTrip) haptic(40);
  }, [pendingTrip?.id, activeTrip]);

  useEffect(() => {
    if (!driver?.id) return undefined;
    const supabase = getDriverSupabase();
    const channel = supabase
      .channel(`web_driver_trips_${driver.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'trips', filter: `driver_id=eq.${driver.id}` },
        (payload) => {
          const trip = payload.new;
          if (!trip) return;
          if (trip.status === 'pending') setPendingTrip(trip);
          else if (isOpenTripStatus(trip.status)) {
            setActiveTrip(trip);
            setPendingTrip(null);
          } else {
            setActiveTrip((prev) => (prev?.id === trip.id ? null : prev));
            setPendingTrip((prev) => (prev?.id === trip.id ? null : prev));
            loadHistory(driver.id);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [driver?.id, loadHistory]);

  useEffect(() => {
    if (pendingTrip?.id && !activeTrip) setTab('inicio');
  }, [pendingTrip?.id, activeTrip]);

  useEffect(() => {
    const offering = Boolean(pendingTrip && !activeTrip);
    const trip = offering ? pendingTrip : activeTrip;
    const navigating = Boolean(trip && isOpenTripStatus(trip.status) && trip.status !== 'pending');
    if (!navigating && !offering) {
      setRouteCoords(null);
      return undefined;
    }

    let cancelled = false;
    const load = async () => {
      const loc = locationRef.current;
      const target = offering ? tripPickupPoint(trip) : tripNavTarget(trip);
      if (!loc || !target) return;
      const line = await fetchRouteLine(
        { lat: loc.lat, lng: loc.lng },
        { lat: target.lat, lng: target.lng },
      );
      if (!cancelled) setRouteCoords(line);
    };

    load();
    const id = setInterval(load, offering ? 20000 : 60000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [activeTrip?.id, activeTrip?.status, activeTrip?.origin_lat, activeTrip?.destination_lat, pendingTrip?.id, pendingTrip?.origin_lat, hasFix, geo.simulating]);

  const runLookup = async (rawPhone, rawNumber = null) => {
    setError('');
    const normalized = normalizeDriverPhone(rawPhone);
    if (!normalized || normalized.length < 8) {
      setError('Ingresá un número válido con código de área.');
      return;
    }
    setBusy(true);
    try {
      const supabase = getDriverSupabase();
      const params = { p_phone: normalized };
      if (rawNumber != null && String(rawNumber).trim() !== '') {
        params.p_driver_number = Number.parseInt(String(rawNumber).trim(), 10);
      }
      const { data, error: rpcError } = await supabase.rpc('lookup_driver_phone_login', params);
      if (rpcError) throw rpcError;
      const result = data || { found: false };
      if (result?.needs_driver_number && Array.isArray(result.choices) && result.choices.length > 0) {
        setChoices(result.choices);
        setStep('driver_number');
        return;
      }
      if (!result?.found) {
        setError('Este teléfono no está registrado en Profesional.');
        return;
      }
      setLookup(result);
      setStep(result.password_initialized && result.has_user ? 'password' : 'setup_password');
    } catch (err) {
      setError(err.message || 'No se pudo verificar el teléfono.');
    } finally {
      setBusy(false);
    }
  };

  const completeWithProfile = async (profile) => {
    setDriver(profile);
    setOnline(Boolean(profile.is_available));
    setStep('phone');
    setPassword('');
    setConfirmPassword('');
    await Promise.all([loadOpenTrip(profile.id), loadHistory(profile.id)]);
  };

  const submitPassword = async (event) => {
    event.preventDefault();
    if (!lookup?.auth_email) return;
    setBusy(true);
    setError('');
    try {
      const supabase = getDriverSupabase();
      const { data, error: signError } = await supabase.auth.signInWithPassword({
        email: lookup.auth_email,
        password,
      });
      if (signError) throw signError;
      const profile = await fetchProfile(data.user.id);
      if (!profile) {
        await supabase.auth.signOut();
        throw new Error('No se encontró el perfil del chofer.');
      }
      await completeWithProfile(profile);
    } catch (err) {
      setError(err.message?.includes('Invalid login credentials')
        ? 'Teléfono o contraseña incorrectos'
        : (err.message || 'No se pudo iniciar sesión'));
    } finally {
      setBusy(false);
    }
  };

  const submitSetup = async (event) => {
    event.preventDefault();
    if (!lookup?.driver_id) return;
    if (!password || password.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const provision = await spaJson('/api/auth/driver-phone/provision', {
        method: 'POST',
        body: {
          driverId: lookup.driver_id,
          phone: normalizeDriverPhone(phone),
          password,
        },
      });
      if (!provision.ok || provision.data?.ok === false) {
        throw new Error(provision.data?.message || 'No se pudo configurar la contraseña.');
      }
      const supabase = getDriverSupabase();
      const authEmail = provision.data?.auth_email || lookup.auth_email;
      const { data, error: signError } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password,
      });
      if (signError) throw signError;
      const profile = await fetchProfile(data.user.id);
      if (!profile) throw new Error('No se encontró el perfil del chofer.');
      await completeWithProfile(profile);
    } catch (err) {
      setError(err.message || 'No se pudo configurar la cuenta.');
    } finally {
      setBusy(false);
    }
  };

  const toggleOnline = async () => {
    if (!driver?.id) return;
    const next = !online;
    if (next && !location) {
      geo.request();
      return;
    }
    setBusy(true);
    setError('');
    try {
      const supabase = getDriverSupabase();
      const { data, error: rpcError } = await supabase.rpc('set_driver_online_status', {
        p_driver_id: driver.id,
        p_online: next,
      });
      if (rpcError) throw rpcError;
      if (data && typeof data === 'object' && data.success === false) {
        throw new Error(data.error || 'No se pudo cambiar el estado.');
      }
      setOnline(next);
      setDriver((prev) => ({ ...prev, is_available: next }));
      if (next) unlockOfferAlert();
      if (next && location && !geo.simulating) await syncLocation(location, true);
    } catch (err) {
      setError(err.message || 'No se pudo cambiar el estado.');
    } finally {
      setBusy(false);
    }
  };

  const acceptTrip = async () => {
    if (!pendingTrip?.id || !driver?.id) return false;
    setBusy(true);
    setError('');
    try {
      const supabase = getDriverSupabase();
      const { data, error: updateError } = await supabase
        .from('trips')
        .update({
          status: 'going_to_pickup',
          accepted_at: new Date().toISOString(),
          dispatch_status: 'accepted',
        })
        .eq('id', pendingTrip.id)
        .eq('driver_id', driver.id)
        .eq('status', 'pending')
        .select()
        .maybeSingle();
      if (updateError) throw updateError;
      if (!data) {
        setPendingTrip(null);
        throw new Error('El viaje ya no está disponible.');
      }
      setActiveTrip(data);
      setPendingTrip(null);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        spaJson('/api/trips/notify-passenger', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: { tripId: data.id },
        }).catch(() => {});
      }
      return true;
    } catch (err) {
      setError(err.message || 'No se pudo aceptar el viaje.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const rejectTrip = async (reason = 'Rechazado por chofer') => {
    if (!pendingTrip?.id) return;
    setBusy(true);
    try {
      const supabase = getDriverSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const { ok, data } = await spaJson('/api/driver/reject-trip', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: { tripId: pendingTrip.id, reason },
      });
      if (!ok && data?.success !== true) {
        throw new Error(data?.error || 'No se pudo rechazar.');
      }
      setPendingTrip(null);
    } catch (err) {
      setError(err.message || 'No se pudo rechazar el viaje.');
      setPendingTrip(null);
    } finally {
      setBusy(false);
    }
  };

  const updateTripStatus = async (status, extra = {}) => {
    if (!activeTrip?.id) return;
    if (status === 'completed') {
      const ok = await confirm({
        title: '¿Finalizar este viaje?',
        amount: activeTrip.price ? formatArs(activeTrip.price) : null,
        body: 'El viaje se completa y volvés a quedar en línea.',
        confirmLabel: 'Finalizar',
        cancelLabel: 'Volver',
        tone: 'success',
      });
      if (!ok) return;
    }
    setBusy(true);
    setError('');
    try {
      const supabase = getDriverSupabase();
      const updates = { status, ...extra };
      if (status === 'in_progress') updates.started_at = new Date().toISOString();
      if (status === 'completed') {
        updates.completed_at = new Date().toISOString();
        if (activeTrip.price) updates.price = activeTrip.price;
      }
      const { data, error: updateError } = await supabase
        .from('trips')
        .update(updates)
        .eq('id', activeTrip.id)
        .eq('driver_id', driver.id)
        .select()
        .single();
      if (updateError) throw updateError;
      if (status === 'completed') {
        setActiveTrip(null);
        await loadHistory(driver.id);
        try {
          await supabase.rpc('set_driver_online_status', {
            p_driver_id: driver.id,
            p_online: true,
          });
        } catch {
          // Si el RPC falla, el chofer igual queda libre en la UI.
        }
        setOnline(true);
      } else {
        setActiveTrip(data);
      }
    } catch (err) {
      setError(err.message || 'No se pudo actualizar el viaje.');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    if (online && driver?.id) {
      const supabase = getDriverSupabase();
      try {
        await supabase.rpc('set_driver_online_status', {
          p_driver_id: driver.id,
          p_online: false,
        });
      } catch {
        // El cierre de sesión sigue aunque el RPC no responda.
      }
    }
    await getDriverSupabase().auth.signOut();
    setDriver(null);
    setOnline(false);
    setActiveTrip(null);
    setPendingTrip(null);
    setLookup(null);
    setStep('phone');
  };

  if (booting) {
    return <SpaBootScreen>Cargando Profesional…</SpaBootScreen>;
  }

  if (!driver) {
    return (
      <SpaAuthScreen>
          <SpaBrand subtitle="Conductor · Salta" />
          <div className="spa-auth-card">
            <h1>Ingresá a tu móvil</h1>
            <p className="lead">Usá el mismo teléfono y contraseña de la app. Podés instalarla en el teléfono.</p>
            <form
              className="mt-6 grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (step === 'phone') runLookup(phone);
                else if (step === 'driver_number') runLookup(phone, driverNumber);
                else if (step === 'setup_password') submitSetup(event);
                else submitPassword(event);
              }}
            >
              <label className="grid gap-1.5 text-[12px] font-medium text-slate-500">
                Teléfono
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  inputMode="tel"
                  autoComplete="tel"
                  disabled={step !== 'phone'}
                  className={spaFieldClass}
                  placeholder="387 123 4567"
                />
              </label>
              {step === 'driver_number' ? (
                <label className="grid gap-1.5 text-[12px] font-medium text-slate-500">
                  Número de móvil
                  <select
                    value={driverNumber}
                    onChange={(event) => setDriverNumber(event.target.value)}
                    className={spaFieldClass}
                  >
                    <option value="">Elegí tu móvil</option>
                    {choices.map((choice) => (
                      <option key={choice.driver_id || choice.driver_number} value={choice.driver_number}>
                        {choice.driver_number} · {choice.full_name || 'Conductor'}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              {step === 'password' || step === 'setup_password' ? (
                <label className="grid gap-1.5 text-[12px] font-medium text-slate-500">
                  Contraseña
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    autoComplete={step === 'setup_password' ? 'new-password' : 'current-password'}
                    className={spaFieldClass}
                  />
                </label>
              ) : null}
              {step === 'setup_password' ? (
                <label className="grid gap-1.5 text-[12px] font-medium text-slate-500">
                  Repetir contraseña
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    autoComplete="new-password"
                    className={spaFieldClass}
                  />
                </label>
              ) : null}
              {error ? <SpaNotice tone="error">{error}</SpaNotice> : null}
              <SpaButton type="submit" disabled={busy}>
                {busy ? 'Ingresando…' : step === 'setup_password' ? 'Crear contraseña' : 'Continuar'}
              </SpaButton>
              {step !== 'phone' ? (
                <button
                  type="button"
                  className="text-sm font-medium text-accent"
                  onClick={() => {
                    setStep('phone');
                    setLookup(null);
                    setPassword('');
                  }}
                >
                  Cambiar número
                </button>
              ) : null}
            </form>
          </div>
          <InstallAppButton label="Instalar Profesional Conductor" />
          <SpaBackHome />
      </SpaAuthScreen>
    );
  }

  const pickup = tripPickupPoint(activeTrip || pendingTrip);
  const dropoff = tripDropoffPoint(activeTrip || pendingTrip);
  const navigating = Boolean(activeTrip && isOpenTripStatus(activeTrip.status) && activeTrip.status !== 'pending');
  const offering = Boolean(pendingTrip && !activeTrip);
  const mapCenter = location
    ? { latitude: location.lat, longitude: location.lng }
    : DEFAULT_CENTER;
  const driverMeta = DRIVER_STATUS[activeTrip?.status] || DRIVER_STATUS.pending;
  const liveSheet = Boolean(tab === 'inicio' && activeTrip);
  const offerSheet = Boolean(tab === 'inicio' && offering);
  const chatReady = Boolean(activeTrip && isTripChatAvailable(activeTrip.status));
  const locationCopy = geo.status === 'unavailable'
    ? 'Este navegador no comparte ubicación. Sin GPS no podés trabajar en línea.'
    : geo.status === 'denied'
      ? 'Sin ubicación no podés ponerte en línea. Activá el permiso en la configuración del sitio o tocá Permitir otra vez.'
      : 'Activá la ubicación para ponerte en línea y recibir viajes.';

  return (
    <SpaMapScreen
      overlay={(
        <>
          {confirmDialog}
          <TripChatModal
            open={tripChat.chatOpen}
            title={activeTrip?.passenger_name || 'Pasajero'}
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
          pickup={pickup}
          dropoff={dropoff}
          driver={location || null}
          routeCoords={routeCoords}
          followDriver={(online || navigating) && !offering}
          navigationMode={navigating}
          driverIcon="arrow"
          showMapControls
          fitToRoute={offering}
        />
      )}
      header={(
        <div className="spa-card-bar">
          <SpaBrand subtitle={driver.full_name || 'Conductor'} />
          <SpaSwitch compact on={online} disabled={busy} onClick={toggleOnline} />
        </div>
      )}
      banner={geo.showBanner ? (
        <LocationBanner
          title="Ubicación desactivada"
          body={locationCopy}
          onAllow={geo.status === 'unavailable' ? undefined : geo.request}
        />
      ) : null}
      sheet={(
        <>
          <SpaSheet compact={liveSheet} offer={offerSheet}>
            {error ? <SpaNotice tone="error">{error}</SpaNotice> : null}

            {tab === 'inicio' && offering ? (
              <NewTripOffer
                trip={pendingTrip}
                busy={busy}
                onAccept={acceptTrip}
                onReject={rejectTrip}
              />
            ) : null}

            {tab === 'inicio' && activeTrip ? (
              <TripLiveSheet
                statusLabel={driverMeta.label}
                statusDesc={activeTrip.status === 'in_progress' ? 'Hacia el destino' : 'Se dirige al origen'}
                progress={activeTrip.status === 'in_progress' ? 1 : 0.72}
                personName={activeTrip.passenger_name || 'Pasajero'}
                personMeta={activeTrip.passenger_phone || null}
                pickup={pickup?.address || activeTrip.origin_address}
                destination={dropoff?.address || activeTrip.destination_address}
                priceLabel={activeTrip.price ? formatArs(activeTrip.price) : null}
                chatAvailable={chatReady}
                chatUnread={tripChat.unreadCount}
                onChat={chatReady ? tripChat.openChat : undefined}
                onSos={() => {
                  if (typeof window !== 'undefined') window.location.href = 'tel:911';
                }}
                primaryAction={driverMeta.action}
                primaryVariant={activeTrip.status === 'in_progress' ? 'success' : 'primary'}
                onPrimary={
                  activeTrip.status === 'in_progress'
                    ? () => updateTripStatus('completed')
                    : () => updateTripStatus('in_progress', { pickup_at: new Date().toISOString() })
                }
                busy={busy}
              />
            ) : null}

            {tab === 'inicio' && !offering && !activeTrip ? (
              <SpaPanel key="espera">
                <div className="py-2 text-center">
                  <SpaKicker live={online}>{online ? 'En línea' : 'Fuera de línea'}</SpaKicker>
                  <h2 className="mt-1 text-[22px] font-semibold tracking-tight text-navy-900">
                    {online ? 'Esperando viajes' : 'Estás desconectado'}
                  </h2>
                  <p className="mx-auto mt-1 max-w-[16rem] text-[14px] leading-relaxed text-slate-500">
                    {online
                      ? 'Cuando te asignen un móvil va a aparecer acá.'
                      : 'Ponete en línea para recibir viajes en Salta.'}
                  </p>
                </div>
              </SpaPanel>
            ) : null}

            {tab === 'historial' ? (
              <SpaPanel key="historial">
                <h2 className="text-[22px] font-semibold tracking-tight text-navy-900">Tus viajes</h2>
                {history.length === 0 ? (
                  <SpaEmpty>Todavía no hay viajes en esta cuenta.</SpaEmpty>
                ) : (
                  <div>
                    {history.map((trip) => (
                      <SpaTripRow
                        key={trip.id}
                        kicker={DRIVER_STATUS[trip.status]?.label || trip.status}
                        title={trip.passenger_name || 'Pasajero'}
                        subtitle={trip.destination_address}
                        meta={trip.price ? formatArs(trip.price) : null}
                      />
                    ))}
                  </div>
                )}
              </SpaPanel>
            ) : null}

            {tab === 'cuenta' ? (
              <SpaPanel key="cuenta">
                <h2 className="text-[22px] font-semibold tracking-tight text-navy-900">{driver.full_name}</h2>
                <p className="text-[15px] text-slate-500">{driver.phone}</p>
                {driver.vehicle_plate ? (
                  <div className="rounded-2xl bg-light-100 px-4 py-3">
                    <p className="text-[15px] font-semibold text-navy-900">{driver.vehicle_model || 'Móvil'}</p>
                    <p className="mt-0.5 text-[13px] text-slate-500">{driver.vehicle_plate}</p>
                  </div>
                ) : null}
                <SpaButton variant="ghost" onClick={logout}>Cerrar sesión</SpaButton>
                <InstallAppButton label="Instalar Profesional Conductor" />
                <SpaBackHome />
              </SpaPanel>
            ) : null}
          </SpaSheet>
          <SpaTabs items={TABS} value={tab} onChange={setTab} compact={liveSheet || offerSheet} />
        </>
      )}
    />
  );
}
