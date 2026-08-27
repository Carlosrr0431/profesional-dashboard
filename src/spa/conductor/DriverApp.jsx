'use client';

import { useCallback, useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { getDriverSupabase } from './driverSupabase';
import { spaJson } from '../shared/api';
import { formatArs } from '../shared/money';
import { normalizeDriverPhone } from '../shared/phone';
import { DRIVER_STATUS, isOpenTripStatus } from '../shared/tripStatus';
import { SpaBackHome, SpaBrand, SpaButton, SpaNotice, SpaSheet, SpaTabs, spaFieldClass } from '../shared/ui';
import InstallAppButton from '../shared/InstallAppButton';
import LocationBanner from '../shared/LocationBanner';
import { useGeoPermission } from '../shared/geoPermission';
import { initInstallPrompt, registerSpaServiceWorker } from '../shared/pwa';

const SpaMap = dynamic(() => import('../shared/SpaMap'), { ssr: false });

const TABS = [
  { id: 'inicio', label: 'Inicio' },
  { id: 'historial', label: 'Historial' },
  { id: 'cuenta', label: 'Cuenta' },
];

const DEFAULT_CENTER = { latitude: -24.78, longitude: -65.42 };

function pickupOf(trip) {
  return {
    lat: Number(trip?.destination_lat),
    lng: Number(trip?.destination_lng),
    address: trip?.destination_address,
  };
}

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
  const geo = useGeoPermission({ watch: Boolean(driver), enabled: Boolean(driver) });
  const location = geo.coords;

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
    if (!online || !location) return;
    syncLocation(location, true);
  }, [online, location, syncLocation]);

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
      if (next && location) await syncLocation(location, true);
    } catch (err) {
      setError(err.message || 'No se pudo cambiar el estado.');
    } finally {
      setBusy(false);
    }
  };

  const acceptTrip = async () => {
    if (!pendingTrip?.id || !driver?.id) return;
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
      if (!data) throw new Error('El viaje ya no está disponible.');
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
    } catch (err) {
      setError(err.message || 'No se pudo aceptar el viaje.');
      setPendingTrip(null);
    } finally {
      setBusy(false);
    }
  };

  const rejectTrip = async () => {
    if (!pendingTrip?.id) return;
    setBusy(true);
    try {
      const supabase = getDriverSupabase();
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      const { ok, data } = await spaJson('/api/driver/reject-trip', {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: { tripId: pendingTrip.id, reason: 'Rechazado por chofer' },
      });
      if (!ok && data?.success !== true) {
        throw new Error(data?.error || 'No se pudo rechazar.');
      }
      setPendingTrip(null);
    } catch (err) {
      setError(err.message || 'No se pudo rechazar el viaje.');
    } finally {
      setBusy(false);
    }
  };

  const updateTripStatus = async (status, extra = {}) => {
    if (!activeTrip?.id) return;
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
        await supabase.rpc('set_driver_online_status', {
          p_driver_id: driver.id,
          p_online: true,
        }).catch(() => {});
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
      await supabase.rpc('set_driver_online_status', {
        p_driver_id: driver.id,
        p_online: false,
      }).catch(() => {});
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
    return (
      <div className="flex h-[100dvh] items-center justify-center bg-[#F4F7FC] text-sm text-slate-500">
        Cargando Profesional…
      </div>
    );
  }

  if (!driver) {
    return (
      <div className="min-h-[100dvh] bg-[#F4F7FC] px-4 py-6">
        <div className="mx-auto flex min-h-[100dvh] max-w-md flex-col justify-center gap-6">
          <SpaBrand subtitle="App web de conductores · Salta Capital" />
          <div className="rounded-[1.6rem] bg-white p-5 shadow-[0_20px_50px_-28px_rgba(15,23,42,0.35)] ring-1 ring-black/[0.04]">
            <h1 className="text-xl font-bold text-navy-900">Ingresá a tu móvil</h1>
            <p className="mt-1 text-sm text-slate-500">Usá el mismo teléfono y contraseña de la app. Podés instalarla en el teléfono.</p>
            <form
              className="mt-5 grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (step === 'phone') runLookup(phone);
                else if (step === 'driver_number') runLookup(phone, driverNumber);
                else if (step === 'setup_password') submitSetup(event);
                else submitPassword(event);
              }}
            >
              <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Teléfono
                <input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  inputMode="tel"
                  disabled={step !== 'phone'}
                  className={spaFieldClass}
                  placeholder="387 123 4567"
                />
              </label>
              {step === 'driver_number' ? (
                <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
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
                <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Contraseña
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className={spaFieldClass}
                  />
                </label>
              ) : null}
              {step === 'setup_password' ? (
                <label className="grid gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  Repetir contraseña
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
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
        </div>
      </div>
    );
  }

  const pickup = activeTrip ? pickupOf(activeTrip) : (pendingTrip ? pickupOf(pendingTrip) : null);
  const mapCenter = location
    ? { latitude: location.lat, longitude: location.lng }
    : DEFAULT_CENTER;
  const driverMeta = DRIVER_STATUS[activeTrip?.status] || DRIVER_STATUS.pending;
  const locationCopy = geo.status === 'unavailable'
    ? 'Este navegador no comparte ubicación. Sin GPS no podés trabajar en línea.'
    : geo.status === 'denied'
      ? 'Sin ubicación no podés ponerte en línea. Activá el permiso en la configuración del sitio o tocá Permitir otra vez.'
      : 'Activá la ubicación para ponerte en línea y recibir viajes.';

  return (
    <div className="relative h-[100dvh] overflow-hidden bg-[#D9E2EC]">
      <div className="absolute inset-0">
        <SpaMap
          center={mapCenter}
          pickup={pickup?.lat ? pickup : null}
          driver={location ? { ...location, heading: 0 } : null}
          followDriver={online}
        />
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto mx-auto flex max-w-lg flex-col gap-2">
          <div className="flex items-center justify-between gap-3 rounded-2xl bg-white/95 px-3 py-2 shadow-[0_10px_30px_-18px_rgba(15,23,42,0.45)] ring-1 ring-black/[0.04] backdrop-blur">
            <SpaBrand subtitle={driver.full_name || 'Conductor'} />
            <button
              type="button"
              onClick={toggleOnline}
              disabled={busy}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${
                online ? 'bg-emerald-500 text-white' : 'bg-light-200 text-slate-600'
              }`}
            >
              {online ? 'En línea' : 'Desconectado'}
            </button>
          </div>
          {geo.showBanner ? (
            <LocationBanner
              title="Ubicación desactivada"
              body={locationCopy}
              onAllow={geo.status === 'unavailable' ? undefined : geo.request}
            />
          ) : null}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 z-20 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-lg flex-col gap-2">
          <SpaSheet>
            {error ? <div className="mb-3"><SpaNotice tone="error">{error}</SpaNotice></div> : null}

            {tab === 'inicio' && pendingTrip && !activeTrip ? (
              <div className="grid gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">Nuevo viaje</p>
                <h2 className="text-xl font-semibold tracking-tight text-navy-900">{pendingTrip.passenger_name || 'Pasajero'}</h2>
                <p className="text-sm text-slate-600">{pendingTrip.destination_address}</p>
                <div className="grid grid-cols-2 gap-2">
                  <SpaButton variant="ghost" disabled={busy} onClick={rejectTrip}>Rechazar</SpaButton>
                  <SpaButton variant="success" disabled={busy} onClick={acceptTrip}>Aceptar</SpaButton>
                </div>
              </div>
            ) : null}

            {tab === 'inicio' && activeTrip ? (
              <div className="grid gap-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent">{driverMeta.label}</p>
                <h2 className="text-xl font-semibold tracking-tight text-navy-900">{activeTrip.passenger_name || 'Pasajero'}</h2>
                <p className="text-sm text-slate-600">{activeTrip.destination_address}</p>
                {activeTrip.status === 'going_to_pickup' || activeTrip.status === 'accepted' ? (
                  <SpaButton disabled={busy} onClick={() => updateTripStatus('in_progress', { pickup_at: new Date().toISOString() })}>
                    Pasajero a bordo
                  </SpaButton>
                ) : null}
                {activeTrip.status === 'in_progress' ? (
                  <SpaButton variant="success" disabled={busy} onClick={() => updateTripStatus('completed')}>
                    Finalizar viaje
                  </SpaButton>
                ) : null}
              </div>
            ) : null}

            {tab === 'inicio' && !pendingTrip && !activeTrip ? (
              <div className="grid gap-2">
                <h2 className="text-xl font-semibold tracking-tight text-navy-900">
                  {online ? 'Esperando viajes' : 'Estás desconectado'}
                </h2>
                <p className="text-sm text-slate-500">
                  {online
                    ? 'Cuando te asignen un móvil va a aparecer acá.'
                    : 'Ponete en línea para recibir viajes en Salta.'}
                </p>
              </div>
            ) : null}

            {tab === 'historial' ? (
              <div className="grid gap-2">
                <h2 className="text-xl font-semibold tracking-tight text-navy-900">Hoy y anteriores</h2>
                {history.length === 0 ? (
                  <p className="text-sm text-slate-500">Todavía no hay viajes en esta cuenta.</p>
                ) : history.map((trip) => (
                  <article key={trip.id} className="rounded-2xl bg-light-100 px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                      {DRIVER_STATUS[trip.status]?.label || trip.status}
                    </p>
                    <p className="text-sm font-semibold text-navy-900">{trip.passenger_name || 'Pasajero'}</p>
                    <p className="text-sm text-slate-500">{trip.destination_address}</p>
                    {trip.price ? <p className="mt-1 text-sm font-semibold">{formatArs(trip.price)}</p> : null}
                  </article>
                ))}
              </div>
            ) : null}

            {tab === 'cuenta' ? (
              <div className="grid gap-3">
                <h2 className="text-xl font-semibold tracking-tight text-navy-900">{driver.full_name}</h2>
                <p className="text-sm text-slate-600">{driver.phone}</p>
                {driver.vehicle_plate ? (
                  <p className="text-sm text-slate-600">
                    {driver.vehicle_model || 'Móvil'} · {driver.vehicle_plate}
                  </p>
                ) : null}
                <SpaButton variant="ghost" onClick={logout}>Cerrar sesión</SpaButton>
                <InstallAppButton label="Instalar Profesional Conductor" />
                <SpaBackHome />
              </div>
            ) : null}
          </SpaSheet>
          <SpaTabs items={TABS} value={tab} onChange={setTab} />
        </div>
      </div>
    </div>
  );
}
