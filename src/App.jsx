import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useDrivers } from './hooks/useDrivers';
import { useSettings } from './hooks/useSettings';
import { usePendingPassengers } from './hooks/usePendingPassengers';
import { useQueuedPassengers } from './hooks/useQueuedPassengers';
import { useScheduledTrips } from './hooks/useScheduledTrips';
import { useToast } from './context/ToastContext';
import { useAdminAuth } from './hooks/useAdminAuth';
const MapView = dynamic(() => import('./components/MapView'), { ssr: false });
import Sidebar from './components/Sidebar';
import DriverPanel from './components/DriverPanel';
import TripAssignModal from './components/TripAssignModal';
import NewTripModal from './components/NewTripModal';
import AiAgentConfirmModal from './components/AiAgentConfirmModal';
import WhatsAppSessionModal from './components/WhatsAppSessionModal';
import DriverManagement from './components/DriverManagement';
import { supabase } from './lib/supabase';
import ZoneManagement from './components/ZoneManagement';
import BroadcastVoiceChat from './components/BroadcastVoiceChat';
import VoiceChat from './components/VoiceChat';
import ViajesPanel from './components/ViajesPanel';
import ScheduledTripsPanel from './components/ScheduledTripsPanel';
import StatisticsPanel from './components/StatisticsPanel';
import GeocodeErrorsPanel from './components/GeocodeErrorsPanel';
import EmulatorGpsSimulator from './components/EmulatorGpsSimulator';
import AdminUsersPanel from './components/admin/AdminUsersPanel';
import DashboardBrand from './components/DashboardBrand';
import DashboardLoadingScreen from './components/DashboardLoadingScreen';
import { useTripStatistics } from './hooks/useTripStatistics';
import { useLiveTrips, toLocalDateInputValue } from './hooks/useLiveTrips';
import { isSuperAdminUser } from './lib/adminSuperUser';

// ─── Vista activa ─────────────────────────────────────────────────────────────
const VIEWS = {
  map:        'map',
  trips:      'trips',
  scheduled:  'scheduled',
  management: 'management',
  zones:      'zones',
  statistics: 'statistics',
  geocodeErrors: 'geocodeErrors',
  emulatorGps: 'emulatorGps',
  adminUsers: 'adminUsers',
};

const DASHBOARD_BASE = '/admin/dashboard';

const VIEW_SLUG = {
  [VIEWS.map]: '',
  [VIEWS.trips]: 'viajes',
  [VIEWS.scheduled]: 'programados',
  [VIEWS.management]: 'choferes',
  [VIEWS.statistics]: 'estadistica',
  [VIEWS.zones]: 'zonas',
  [VIEWS.emulatorGps]: 'sim-gps',
  [VIEWS.adminUsers]: 'usuarios',
  [VIEWS.geocodeErrors]: 'geocode',
};

const SLUG_VIEW = Object.fromEntries(
  Object.entries(VIEW_SLUG).map(([view, slug]) => [slug, view]),
);

function pathForView(view) {
  const slug = VIEW_SLUG[view] ?? '';
  return slug ? `${DASHBOARD_BASE}/${slug}` : DASHBOARD_BASE;
}

function viewFromPath(pathname) {
  if (!pathname || !pathname.startsWith(DASHBOARD_BASE)) return VIEWS.map;
  const rest = pathname.slice(DASHBOARD_BASE.length).replace(/^\//, '');
  const slug = rest.split('/').filter(Boolean)[0] || '';
  return SLUG_VIEW[slug] || VIEWS.map;
}

export default function App() {
  const toast = useToast();
  const router = useRouter();
  const { signOut, user } = useAdminAuth();
  const isSuperAdmin = isSuperAdminUser(user);
  const { drivers, loading } = useDrivers();
  const pendingPassengers = usePendingPassengers();
  const queueData = useQueuedPassengers();
  const [tripsDate, setTripsDate] = useState(() => toLocalDateInputValue());
  const [tripsMode, setTripsMode] = useState('day');
  const liveTripsData = useLiveTrips(tripsDate, tripsMode);
  const scheduledData = useScheduledTrips();
  const {
    tariffPerKm, tariffBase, commissionPercent,
    passengerAppTariffPerKm, passengerAppTariffBase, passengerAppCommissionPercent,
    driverAppLatestVersionCode, passengerAppLatestVersionCode,
    whatsappAgentEnabled, calculatePrice, updateSetting,
  } = useSettings();
  const tripStatistics = useTripStatistics('30d');

  const [selectedId,      setSelectedId]      = useState(null);
  const [panelDriverId,   setPanelDriverId]   = useState(null);
  const [tripModalDriver, setTripModalDriver] = useState(null);
  const [showAiAgentModal, setShowAiAgentModal] = useState(false);
  const [showWhatsAppSessionModal, setShowWhatsAppSessionModal] = useState(false);
  const [whatsappSessionStatus, setWhatsappSessionStatus] = useState('unknown');
  const [whatsappSessionChecked, setWhatsappSessionChecked] = useState(false);
  const [whatsappJustConnected, setWhatsappJustConnected] = useState(false);
  const [currentView,     setCurrentView]     = useState(() => (
    typeof window !== 'undefined'
      ? viewFromPath(window.location.pathname)
      : VIEWS.map
  ));
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [multiSelectedIds,setMultiSelectedIds]= useState(new Set());
  const [showBroadcast,   setShowBroadcast]   = useState(false);
  const [voiceChatDriver, setVoiceChatDriver] = useState(null);
  // Ruta de preview al asignar viaje: { polylineCoords?, origin, destination? } | null
  const [previewRoute,    setPreviewRoute]    = useState(null);
  const [fleetDrawerOpen,   setFleetDrawerOpen] = useState(false);
  const [isDesktopLayout,   setIsDesktopLayout] = useState(false);
  const [mapPopover,        setMapPopover]       = useState(null);

  const closePopover = useCallback(() => {
    setMapPopover(null);
    setPreviewRoute(null);
  }, []);

  useEffect(() => {
    if (!mapPopover) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closePopover(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mapPopover, closePopover]);

  const mapRef = useRef(null);
  const whatsappConnected = whatsappSessionStatus === 'connected';
  // El dashboard ya no se bloquea si WhatsApp está desconectado.
  // La conexión se gestiona en /admin/whatsapp.
  const whatsappGateRequired = false;

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const syncLayout = () => setIsDesktopLayout(media.matches);
    syncLayout();
    media.addEventListener('change', syncLayout);
    return () => media.removeEventListener('change', syncLayout);
  }, []);

  // Estado multi-línea: verde solo si TODAS están líneas están conectadas.
  useEffect(() => {
    let cancelled = false;

    const refreshSessionStatus = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData?.session?.access_token;
        const headers = token ? { Authorization: `Bearer ${token}` } : {};

        // Preferir /api/whatsapp/lines (ambas líneas). Fallback a /session.
        const res = await fetch('/api/whatsapp/lines', { cache: 'no-store', headers });
        const payload = await res.json().catch(() => ({}));
        if (cancelled) return;

        if (res.ok && Array.isArray(payload?.lines) && payload.lines.length > 0) {
          const allConnected = payload.lines.every((l) => Boolean(l.connected));
          const anyWaiting = payload.lines.some((l) =>
            ['need_scan', 'connecting'].includes(String(l.status || ''))
          );
          setWhatsappSessionStatus(
            allConnected ? 'connected' : (anyWaiting ? 'need_scan' : 'disconnected')
          );
        } else {
          const res2 = await fetch('/api/whatsapp/session', { cache: 'no-store', headers });
          const p2 = await res2.json().catch(() => ({}));
          if (cancelled) return;
          if (res2.ok && p2?.status) {
            setWhatsappSessionStatus(String(p2.status));
          } else {
            setWhatsappSessionStatus('unknown');
          }
        }
        setWhatsappSessionChecked(true);
      } catch {
        if (!cancelled) setWhatsappSessionChecked(true);
      }
    };

    refreshSessionStatus();
    const pollMs = whatsappConnected ? 30000 : 8000;
    const poll = setInterval(refreshSessionStatus, pollMs);

    return () => {
      cancelled = true;
      clearInterval(poll);
    };
  }, [whatsappConnected]);

  // ── Selección múltiple ─────────────────────────────────────────────────────
  const toggleMultiSelect = useCallback((driverId) => {
    setMultiSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(driverId)) next.delete(driverId);
      else next.add(driverId);
      return next;
    });
  }, []);

  const selectAllAvailable = useCallback(() => {
    const ids = drivers
      .filter((d) => d.isOnline && !d.activeTrip)
      .map((d) => d.id);
    setMultiSelectedIds(new Set(ids));
  }, [drivers]);

  const clearMultiSelect = useCallback(() => {
    setMultiSelectedIds(new Set());
    setMultiSelectMode(false);
    setShowBroadcast(false);
  }, []);

  const handleFleetDriverSelect = useCallback((id) => {
    if (multiSelectMode) {
      toggleMultiSelect(id);
      return;
    }
    setSelectedId(id);
    setPanelDriverId(id);
    if (!isDesktopLayout) setFleetDrawerOpen(false);
  }, [isDesktopLayout, multiSelectMode, toggleMultiSelect]);

  const multiSelectedDrivers = drivers.filter((d) => multiSelectedIds.has(d.id));

  // ── Mapa ───────────────────────────────────────────────────────────────────
  const handleCenterDriver = useCallback((driver) => {
    if (mapRef.current && driver.lat && driver.lng) {
      // react-map-gl/maplibre: center=[lng, lat]
      mapRef.current.flyTo({ center: [Number(driver.lng), Number(driver.lat)], zoom: 16, duration: 600 });
    }
  }, []);

  const handleCenterAll = useCallback(() => {
    if (!mapRef.current || drivers.length === 0) return;
    const pts = drivers.filter((d) => d.lat && d.lng);
    if (pts.length === 0) return;
    if (pts.length === 1) {
      mapRef.current.flyTo({ center: [Number(pts[0].lng), Number(pts[0].lat)], zoom: 15, duration: 600 });
      return;
    }
    const lngs = pts.map((d) => Number(d.lng));
    const lats = pts.map((d) => Number(d.lat));
    // react-map-gl/maplibre: fitBounds([[swLng,swLat],[neLng,neLat]])
    mapRef.current.fitBounds(
      [[Math.min(...lngs) - 0.002, Math.min(...lats) - 0.002],
       [Math.max(...lngs) + 0.002, Math.max(...lats) + 0.002]],
      { padding: 64, duration: 700 },
    );
  }, [drivers]);

  const handleAssignTrip = useCallback((driver) => setTripModalDriver(driver), []);
  const handleTripSuccess = useCallback(() => {
    setTripModalDriver(null);
    toast.success('Viaje asignado al chofer correctamente');
  }, [toast]);

  const handleSignOut = useCallback(async () => {
    try {
      await signOut();
      router.replace('/admin/login');
    } catch {
      toast.error('No pudimos cerrar la sesión. Intentá de nuevo.');
    }
  }, [router, signOut, toast]);

  const goTo = useCallback((view) => {
    let target = view;
    if (
      !isSuperAdmin
      && (target === VIEWS.adminUsers || target === VIEWS.emulatorGps)
    ) {
      target = VIEWS.map;
    }
    if (target !== VIEWS.map) {
      setPanelDriverId(null);
      setSelectedId(null);
    }
    setCurrentView(target);
    const nextPath = pathForView(target);
    if (typeof window !== 'undefined' && window.location.pathname !== nextPath) {
      // Actualiza la URL sin navegación de Next (evita remount + loading).
      window.history.pushState({ dashboardView: target }, '', nextPath);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    const syncFromUrl = () => {
      let next = viewFromPath(window.location.pathname);
      if (
        !isSuperAdmin
        && (next === VIEWS.adminUsers || next === VIEWS.emulatorGps)
      ) {
        next = VIEWS.map;
        if (window.location.pathname !== DASHBOARD_BASE) {
          window.history.replaceState({ dashboardView: next }, '', DASHBOARD_BASE);
        }
      }
      setCurrentView(next);
    };

    syncFromUrl();
    window.addEventListener('popstate', syncFromUrl);
    return () => window.removeEventListener('popstate', syncFromUrl);
  }, [isSuperAdmin]);

  useEffect(() => {
    if (panelDriverId) setFleetDrawerOpen(false);
  }, [panelDriverId]);

  useEffect(() => {
    if (currentView !== VIEWS.map) setFleetDrawerOpen(false);
  }, [currentView]);

  const handleNewTripSuccess = useCallback(() => {
    setMapPopover(null);
    setPreviewRoute(null);
    setTripsDate(toLocalDateInputValue());
    queueData.refetch?.();
    liveTripsData.refetch?.();
    goTo(VIEWS.trips);
    toast.success('Viaje encolado correctamente');
  }, [queueData, liveTripsData, goTo, toast]);

  const renderNavigation = (compact = false) => (
    <>
      <NavTab
        compact={compact}
        active={currentView === VIEWS.map}
        onClick={() => goTo(VIEWS.map)}
        icon={
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
        }
      >
        Mapa
      </NavTab>

      <NavTab
        compact={compact}
        active={currentView === VIEWS.trips}
        onClick={() => {
          if (currentView === VIEWS.trips) goTo(VIEWS.map);
          else {
            setTripsDate(toLocalDateInputValue());
            goTo(VIEWS.trips);
          }
        }}
        badge={queueData.stats.inQueue > 0 ? queueData.stats.inQueue : null}
        badgeColor="warning"
        icon={
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10m16 0V8a1 1 0 00-1-1h-3.5M6 8h2" />
          </svg>
        }
      >
        Viajes
      </NavTab>

      <NavTab
        compact={compact}
        active={currentView === VIEWS.scheduled}
        onClick={() => goTo(currentView === VIEWS.scheduled ? VIEWS.map : VIEWS.scheduled)}
        badge={scheduledData.stats.total > 0 ? scheduledData.stats.total : null}
        badgeColor={scheduledData.stats.imminent > 0 ? 'warning-pulse' : 'violet'}
        icon={
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        }
      >
        Programados
      </NavTab>

      <NavTab
        compact={compact}
        active={currentView === VIEWS.management}
        onClick={() => goTo(currentView === VIEWS.management ? VIEWS.map : VIEWS.management)}
        icon={
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        }
      >
        Choferes
      </NavTab>

      <NavTab
        compact={compact}
        active={currentView === VIEWS.statistics}
        onClick={() => goTo(currentView === VIEWS.statistics ? VIEWS.map : VIEWS.statistics)}
        icon={
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        }
      >
        Estadística
      </NavTab>

      <NavTab
        compact={compact}
        active={currentView === VIEWS.zones}
        onClick={() => goTo(currentView === VIEWS.zones ? VIEWS.map : VIEWS.zones)}
        icon={
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
          </svg>
        }
      >
        Zonas
      </NavTab>

      {isSuperAdmin ? (
        <NavTab
          compact={compact}
          active={currentView === VIEWS.emulatorGps}
          onClick={() => goTo(currentView === VIEWS.emulatorGps ? VIEWS.map : VIEWS.emulatorGps)}
          icon={
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          }
        >
          Sim. GPS
        </NavTab>
      ) : null}

      {isSuperAdmin ? (
        <NavTab
          compact={compact}
          active={currentView === VIEWS.adminUsers}
          onClick={() => goTo(currentView === VIEWS.adminUsers ? VIEWS.map : VIEWS.adminUsers)}
          icon={
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          }
        >
          Usuarios
        </NavTab>
      ) : null}
    </>
  );

  // ── Pantalla de carga ──────────────────────────────────────────────────────
  if (loading) {
    return <DashboardLoadingScreen message="Cargando operaciones…" />;
  }

  const showFleetSidebar = isDesktopLayout || fleetDrawerOpen;

  const renderSideNavigation = () => (
    <>
      <SideNavItem active={currentView === VIEWS.map} onClick={() => goTo(VIEWS.map)}
        icon={<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>}
        label="Mapa" />
      <SideNavItem active={currentView === VIEWS.trips}
        onClick={() => { if (currentView === VIEWS.trips) goTo(VIEWS.map); else { setTripsDate(toLocalDateInputValue()); goTo(VIEWS.trips); } }}
        badge={queueData.stats.inQueue > 0 ? queueData.stats.inQueue : null} badgeColor="warning"
        icon={<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10m16 0V8a1 1 0 00-1-1h-3.5M6 8h2" /></svg>}
        label="Viajes" />
      <SideNavItem active={currentView === VIEWS.scheduled}
        onClick={() => goTo(currentView === VIEWS.scheduled ? VIEWS.map : VIEWS.scheduled)}
        badge={scheduledData.stats.total > 0 ? scheduledData.stats.total : null}
        badgeColor={scheduledData.stats.imminent > 0 ? 'warning-pulse' : 'violet'}
        icon={<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
        label="Programados" />
      <SideNavItem active={currentView === VIEWS.management}
        onClick={() => goTo(currentView === VIEWS.management ? VIEWS.map : VIEWS.management)}
        icon={<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>}
        label="Choferes" />
      <SideNavItem active={currentView === VIEWS.statistics}
        onClick={() => goTo(currentView === VIEWS.statistics ? VIEWS.map : VIEWS.statistics)}
        icon={<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>}
        label="Estadística" />
      <SideNavItem active={currentView === VIEWS.zones}
        onClick={() => goTo(currentView === VIEWS.zones ? VIEWS.map : VIEWS.zones)}
        icon={<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" /></svg>}
        label="Zonas" />
      {isSuperAdmin ? (
        <SideNavItem active={currentView === VIEWS.emulatorGps}
          onClick={() => goTo(currentView === VIEWS.emulatorGps ? VIEWS.map : VIEWS.emulatorGps)}
          icon={<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>}
          label="Sim. GPS" />
      ) : null}
      {isSuperAdmin ? (
        <SideNavItem active={currentView === VIEWS.adminUsers}
          onClick={() => goTo(currentView === VIEWS.adminUsers ? VIEWS.map : VIEWS.adminUsers)}
          icon={<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
          label="Usuarios" />
      ) : null}
    </>
  );

  return (
    <div className="relative flex h-full min-h-0 overflow-hidden bg-[linear-gradient(180deg,#f8f9fc_0%,#eef1f6_100%)]">

      {/* ══════════════════════════════════════════════════════════════════════
          SIDEBAR LATERAL (desktop — se pliega / despliega con hover)
      ══════════════════════════════════════════════════════════════════════ */}
      <aside className="app-sidebar hidden lg:flex lg:flex-col">
        {/* Brand */}
        <div className="flex-shrink-0 flex items-center gap-2.5 px-[14px] py-3.5 border-b border-white/8">
          <DashboardBrand imageClassName="h-7 w-7 min-w-[28px] flex-shrink-0 object-contain rounded-lg" style={{ filter: 'brightness(0) invert(1)' }} />
          <span className="app-sidebar-label text-[13px] font-bold text-white/90 tracking-tight">Profesional</span>
        </div>
        {/* Navegación */}
        <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5 overflow-y-auto overflow-x-hidden min-h-0 scrollbar-none">
          {renderSideNavigation()}
          <div className="my-2 mx-1 h-px bg-white/10 flex-shrink-0" />
          <SideNavItem active={multiSelectMode}
            onClick={() => { if (multiSelectMode) clearMultiSelect(); else { setMultiSelectMode(true); setPanelDriverId(null); setSelectedId(null); setVoiceChatDriver(null); } }}
            badge={multiSelectMode && multiSelectedIds.size > 0 ? multiSelectedIds.size : null} badgeColor="violet"
            icon={<svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>}
            label={multiSelectMode ? `Selección (${multiSelectedIds.size})` : 'Multi-selección'} />
          <SideNavItem active={showBroadcast}
            onClick={() => { setMultiSelectMode(true); selectAllAvailable(); setShowBroadcast(true); setVoiceChatDriver(null); setPanelDriverId(null); setSelectedId(null); }}
            icon={<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/></svg>}
            label="Audio masivo" />
        </nav>
        {/* Acciones */}
        <div className="flex-shrink-0 border-t border-white/8 px-2 py-2.5 flex flex-col gap-0.5">
          <SideNavItem active={false} onClick={() => setMapPopover('new-trip')}
            icon={<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/></svg>}
            label="Nuevo viaje" variant="primary-sidebar" />
          <SideNavItem active={false} onClick={() => setShowAiAgentModal(true)}
            icon={<span className="relative flex h-4 w-4 flex-shrink-0 items-center justify-center">{whatsappAgentEnabled ? <><span className="animate-ping absolute h-2 w-2 rounded-full bg-emerald-500 opacity-60"/><span className="relative h-2 w-2 rounded-full bg-emerald-500"/></> : <span className="h-2 w-2 rounded-full bg-slate-400"/>}</span>}
            label="Agente IA" toneClass={whatsappAgentEnabled ? 'text-emerald-400' : 'text-slate-400'} />
          <SideNavItem active={false} onClick={() => { window.location.href = '/admin/whatsapp'; }}
            icon={<span className="relative flex h-4 w-4 flex-shrink-0 items-center justify-center"><span className={`relative h-2 w-2 rounded-full ${whatsappConnected ? 'bg-emerald-500' : 'bg-red-500'}`}/></span>}
            label="WhatsApp" toneClass={whatsappConnected ? 'text-emerald-400' : 'text-red-400'} />
          <div className="my-0.5 mx-1 h-px bg-white/10 flex-shrink-0" />
          <SideNavItem active={false} onClick={handleSignOut}
            icon={<svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1"/></svg>}
            label="Cerrar sesión" />
        </div>
      </aside>

      {/* ══════════════════════════════════════════════════════════════════════
          ÁREA PRINCIPAL
      ══════════════════════════════════════════════════════════════════════ */}
      <div className="flex flex-1 min-h-0 flex-col overflow-hidden">

      {/* BARRA SUPERIOR (solo en móvil / tablet) */}
      <header className="z-30 shrink-0 border-b border-slate-200/70 bg-white/98 backdrop-blur-xl lg:hidden">
        <div className="flex h-12 items-center gap-2 px-3 lg:h-14 lg:gap-3 lg:px-5">

        {/* ── Logo ─────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center">
          <DashboardBrand imageClassName="h-8 w-auto max-w-[118px] object-contain lg:h-9 lg:max-w-[132px]" />
        </div>

        <nav className="hidden flex-1 items-center justify-center lg:flex">
          <div className="flex items-center gap-0.5 rounded-2xl bg-slate-100/90 p-1">
            {renderNavigation(false)}
          </div>
        </nav>

        {/* ── Acciones ─────────────────────────────────────────────────── */}
        <div className="ml-auto flex shrink-0 items-center gap-1 lg:gap-1.5">
          <button
            type="button"
            onClick={() => setShowAiAgentModal(true)}
            className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold transition-all ${
              whatsappAgentEnabled
                ? 'bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/25 hover:bg-emerald-500/18'
                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
            title={whatsappAgentEnabled ? 'Desactivar agente IA de WhatsApp' : 'Activar agente IA de WhatsApp'}
          >
            <span className="relative flex h-1.5 w-1.5">
              {whatsappAgentEnabled ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-gray-400" />
              )}
            </span>
            <span className="hidden sm:inline">Agente IA</span>
          </button>

          <button
            type="button"
            onClick={() => {
              window.location.href = '/admin/whatsapp';
            }}
            className={`flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-semibold transition-all ${
              whatsappConnected
                ? 'bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/25 hover:bg-emerald-500/18'
                : 'bg-red-500/10 text-red-600 ring-1 ring-red-500/25 hover:bg-red-500/15'
            }`}
            title={
              whatsappConnected
                ? 'Ambas líneas WhatsApp conectadas'
                : 'Hay una línea desconectada — tocá para reconectar'
            }
          >
            <span className="relative flex h-1.5 w-1.5">
              {whatsappConnected ? (
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
              ) : (
                <>
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500 opacity-60" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-rose-500" />
                </>
              )}
            </span>
            <span className="hidden sm:inline">WhatsApp</span>
          </button>

          <div className="hidden h-5 w-px bg-gray-200 md:block" />

          <button
            type="button"
            onClick={() => setMapPopover('new-trip')}
            className="flex h-8 items-center gap-1.5 rounded-full bg-navy-900 px-4 text-[12px] font-semibold text-white shadow-[0_1px_3px_rgba(15,23,42,0.25),0_0_0_1px_rgba(15,23,42,0.1)] transition-all hover:bg-navy-900/90 hover:shadow-[0_2px_8px_rgba(15,23,42,0.3)] active:scale-[0.97]"
            title="Agregar viaje a la cola"
          >
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            <span className="hidden sm:inline">Nuevo viaje</span>
          </button>

          <div className="hidden items-center gap-1.5 md:flex">
          <IconAction
            active={multiSelectMode}
            title={multiSelectMode ? `Selección activa (${multiSelectedIds.size})` : 'Selección múltiple'}
            badge={multiSelectMode && multiSelectedIds.size > 0 ? multiSelectedIds.size : 0}
            onClick={() => {
              if (multiSelectMode) clearMultiSelect();
              else {
                setMultiSelectMode(true);
                setPanelDriverId(null);
                setSelectedId(null);
                setVoiceChatDriver(null);
              }
            }}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
            </svg>
          </IconAction>

          <IconAction
            active={showBroadcast}
            title="Audio masivo a choferes disponibles"
            onClick={() => {
              setMultiSelectMode(true);
              selectAllAvailable();
              setShowBroadcast(true);
              setVoiceChatDriver(null);
              setPanelDriverId(null);
              setSelectedId(null);
            }}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
            </svg>
          </IconAction>
          </div>

          <div className="hidden h-5 w-px bg-gray-200 md:block" />

          <IconAction
            title="Cerrar sesión"
            onClick={handleSignOut}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
            </svg>
          </IconAction>
        </div>
        </div>

        <nav className="border-t border-slate-200/60 px-2 py-1.5 lg:hidden">
          <div className="overflow-x-auto pb-0.5 scrollbar-none">
            <div className="flex w-max items-center gap-0.5 rounded-2xl bg-slate-100/90 p-1">
              {renderNavigation(true)}
            </div>
          </div>
        </nav>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════
          CONTENIDO PRINCIPAL
      ══════════════════════════════════════════════════════════════════════ */}
      <main className="flex-1 min-h-0 flex overflow-hidden lg:pl-[76px]">

        {currentView === VIEWS.management ? (
          <DriverManagement onBack={() => goTo(VIEWS.map)} />

        ) : currentView === VIEWS.zones ? (
          <ZoneManagement onBack={() => goTo(VIEWS.map)} />

        ) : currentView === VIEWS.trips ? (
          <div className="flex-1 w-full min-w-0 min-h-0 flex flex-col">
            <ViajesPanel
              queueData={queueData}
              liveTripsData={liveTripsData}
              selectedDate={tripsDate}
              onSelectedDateChange={setTripsDate}
              selectedMode={tripsMode}
              onSelectedModeChange={setTripsMode}
              onBack={() => goTo(VIEWS.map)}
            />
          </div>

        ) : currentView === VIEWS.scheduled ? (
          <div className="flex-1 w-full min-w-0 min-h-0 flex flex-col">
            <ScheduledTripsPanel
              {...scheduledData}
              onBack={() => goTo(VIEWS.map)}
            />
          </div>

        ) : currentView === VIEWS.statistics ? (
          <div className="flex-1 w-full min-w-0 min-h-0 flex flex-col">
            <StatisticsPanel
              {...tripStatistics}
              drivers={drivers}
            />
          </div>

        ) : currentView === VIEWS.geocodeErrors ? (
          <div className="flex-1 min-h-0 flex">
            <GeocodeErrorsPanel onBack={() => goTo(VIEWS.map)} />
          </div>
        ) : isSuperAdmin && currentView === VIEWS.emulatorGps ? (
          <div className="flex-1 w-full min-w-0 min-h-0 flex flex-col">
            <EmulatorGpsSimulator onBack={() => goTo(VIEWS.map)} />
          </div>

        ) : isSuperAdmin && currentView === VIEWS.adminUsers ? (
          <AdminUsersPanel
            onBack={() => goTo(VIEWS.map)}
            currentUserId={user?.id}
            driverAppLatestVersionCode={driverAppLatestVersionCode}
            passengerAppLatestVersionCode={passengerAppLatestVersionCode}
            onUpdateSetting={updateSetting}
          />

        ) : (
          /* ── Vista mapa ──────────────────────────────────────────────── */
          <div className="relative flex min-h-0 min-w-0 flex-1 overflow-hidden">
            {showFleetSidebar ? (
              <>
                {!isDesktopLayout ? (
                  <button
                    type="button"
                    className="fixed inset-0 z-40 bg-navy-900/45 backdrop-blur-[1px]"
                    onClick={() => setFleetDrawerOpen(false)}
                    aria-label="Cerrar flota"
                  />
                ) : null}
                <div className={isDesktopLayout
                  ? 'absolute top-3 bottom-3 left-0 z-20 flex flex-col rounded-2xl overflow-hidden shadow-2xl shadow-navy-900/20 ring-1 ring-black/[0.06]'
                  : 'fixed inset-0 z-50 flex'}>
                  <Sidebar
                    drivers={drivers}
                    selectedId={selectedId}
                    onSelectDriver={handleFleetDriverSelect}
                    onCenterDriver={handleCenterDriver}
                    tariffPerKm={tariffPerKm}
                    tariffBase={tariffBase}
                    commissionPercent={commissionPercent}
                    passengerAppTariffPerKm={passengerAppTariffPerKm}
                    passengerAppTariffBase={passengerAppTariffBase}
                    passengerAppCommissionPercent={passengerAppCommissionPercent}
                    onUpdateSetting={updateSetting}
                    onClose={!isDesktopLayout ? () => setFleetDrawerOpen(false) : undefined}
                  />
                </div>
              </>
            ) : null}

            <div className="relative min-h-0 flex-1 overflow-hidden">
              <MapView
                drivers={drivers}
                pendingPassengers={pendingPassengers}
                selectedId={selectedId}
                onSelectDriver={setSelectedId}
                mapRef={mapRef}
                onAssignTrip={handleAssignTrip}
                multiSelectMode={multiSelectMode}
                multiSelectedIds={multiSelectedIds}
                onToggleMultiSelect={toggleMultiSelect}
                previewRoute={previewRoute}
                onSendAudio={(driver) => {
                  setShowBroadcast(false);
                  setVoiceChatDriver(driver);
                }}
              />

              {!fleetDrawerOpen && !panelDriverId ? (
                <button
                  type="button"
                  onClick={() => setFleetDrawerOpen(true)}
                  className="pointer-events-auto absolute bottom-4 left-4 z-20 flex items-center gap-2 rounded-2xl bg-navy-900/90 backdrop-blur-sm px-3.5 py-2.5 text-[12px] font-bold text-white shadow-xl shadow-navy-900/20 transition hover:bg-navy-900 lg:hidden"
                >
                  <svg className="h-4 w-4 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Flota
                  <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
                    {drivers.length}
                  </span>
                </button>
              ) : null}

              {/* ── Banner de selección múltiple ─────────────────────── */}
              {multiSelectMode && (
                <div className="absolute left-3 right-3 top-3 z-10 sm:left-1/2 sm:right-auto sm:top-4 sm:w-auto sm:max-w-[calc(100vw-2rem)] sm:-translate-x-1/2">
                  <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-light-300/60 bg-white/97 px-3 py-2.5 shadow-2xl shadow-navy-900/10 backdrop-blur-md sm:flex-nowrap sm:gap-2.5 sm:px-4">
                    <div className="flex items-center gap-2 border-light-300/60 pr-2 sm:border-r">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-violet-500 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-violet-500" />
                      </span>
                      <span className="text-[11px] font-semibold text-navy-900 sm:text-xs">Selección activa</span>
                    </div>

                    <span className="text-[11px] tabular-nums text-gray-500 sm:text-xs">
                      {multiSelectedIds.size} seleccionado{multiSelectedIds.size !== 1 ? 's' : ''}
                    </span>

                    <button
                      onClick={selectAllAvailable}
                      className="rounded-lg px-2 py-1 text-[10px] font-semibold text-accent transition-colors hover:bg-accent/5 hover:text-accent/80 sm:text-[11px]"
                    >
                      Todos disponibles
                    </button>

                    {multiSelectedIds.size > 0 ? (
                      <button
                        onClick={() => setShowBroadcast(true)}
                        className="flex items-center gap-1.5 rounded-xl bg-accent px-2.5 py-1.5 text-[10px] font-semibold text-white shadow-sm shadow-accent/30 transition-all hover:bg-accent/90 sm:px-3 sm:text-[11px]"
                      >
                        <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                        </svg>
                        Audio
                      </button>
                    ) : null}

                    <button
                      onClick={clearMultiSelect}
                      className="ml-auto flex h-7 w-7 items-center justify-center rounded-lg bg-light-200 text-gray-400 transition-all hover:bg-light-300 hover:text-danger sm:ml-0"
                      title="Salir de selección"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              )}

              {/* ── Indicadores flotantes + acciones ──────────────────── */}
              {mapPopover ? (
                <div className="fixed inset-0 z-[9998]" onClick={closePopover} aria-hidden="true" />
              ) : null}
              <div className="pointer-events-none absolute bottom-4 right-4 z-10 flex flex-col items-end gap-2">
                {/* Popovers */}
                {mapPopover === 'queue' && (
                  <div className="pointer-events-auto mb-1 w-80 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/98 shadow-2xl shadow-navy-900/18 backdrop-blur-xl">
                    <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5">
                      <p className="text-[12px] font-bold text-slate-900">Cola de espera</p>
                      <span className="text-[10px] font-medium text-slate-400">{queueData.stats.inQueue} pasajeros · espera media {queueData.stats.avgWaitMinutes}min</span>
                    </div>
                    <div className="max-h-[min(280px,42vh)] overflow-y-auto overscroll-contain">
                      {queueData.queuedList.length === 0 ? (
                        <p className="py-6 text-center text-xs text-slate-400">Cola vacía</p>
                      ) : (
                        queueData.queuedList.map((item, i) => (
                          <div key={item.id || i} className="border-b border-slate-50 px-3.5 py-2.5 last:border-0 hover:bg-slate-50/80">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-[12px] font-semibold text-slate-900">{item.passengerName}</p>
                              <span className="shrink-0 text-[10px] font-semibold text-amber-600">{item.waitMinutes}min</span>
                            </div>
                            <p className="mt-0.5 truncate text-[11px] text-slate-500">{item.destination_address || item.driverOrigin || '—'}</p>
                          </div>
                        ))
                      )}
                    </div>
                    <button
                      onClick={() => { setMapPopover(null); setTripsDate(toLocalDateInputValue()); goTo(VIEWS.trips); }}
                      className="w-full border-t border-slate-100 px-3.5 py-2.5 text-[11px] font-semibold text-accent transition-all hover:bg-accent/5"
                    >
                      Ver panel completo →
                    </button>
                  </div>
                )}
                {mapPopover === 'trips' && (
                  <div className="pointer-events-auto mb-1 w-80 overflow-hidden rounded-2xl border border-slate-200/70 bg-white/98 shadow-2xl shadow-navy-900/18 backdrop-blur-xl">
                    <div className="flex items-center justify-between border-b border-slate-100 px-3.5 py-2.5">
                      <p className="text-[12px] font-bold text-slate-900">Viajes activos</p>
                      <span className="text-[10px] font-medium text-slate-400">{liveTripsData.allTrips.filter((t) => t.isActive).length} en curso</span>
                    </div>
                    <div className="max-h-[min(280px,42vh)] overflow-y-auto overscroll-contain">
                      {liveTripsData.allTrips.filter((t) => t.isActive || t.isQueued).length === 0 ? (
                        <p className="py-6 text-center text-xs text-slate-400">Sin viajes activos</p>
                      ) : (
                        liveTripsData.allTrips.filter((t) => t.isActive || t.isQueued).slice(0, 8).map((trip, i) => {
                          const statusLabel = trip.status === 'in_progress' ? 'En curso' : trip.status === 'going_to_pickup' ? 'En camino' : trip.status === 'accepted' ? 'Asignado' : trip.status === 'pending' ? 'Pendiente' : 'En cola';
                          const statusCls = trip.status === 'in_progress' ? 'bg-emerald-500/12 text-emerald-700' : trip.status === 'going_to_pickup' || trip.status === 'accepted' ? 'bg-blue-500/12 text-blue-700' : 'bg-amber-500/12 text-amber-700';
                          return (
                            <div key={trip.id || i} className="border-b border-slate-50 px-3.5 py-2.5 last:border-0 hover:bg-slate-50/80">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-[12px] font-semibold text-slate-900">{trip.passengerName}</p>
                                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[9px] font-bold ${statusCls}`}>{statusLabel}</span>
                              </div>
                              <p className="mt-0.5 truncate text-[11px] text-slate-500">{trip.pickupAddress || trip.destination || '—'}</p>
                              {trip.driver ? (
                                <p className="mt-0.5 truncate text-[10px] text-slate-400">🚗 {trip.driver.fullName || trip.driver.full_name || String(trip.driver)}</p>
                              ) : null}
                            </div>
                          );
                        })
                      )}
                    </div>
                    <button
                      onClick={() => { setMapPopover(null); setTripsDate(toLocalDateInputValue()); goTo(VIEWS.trips); }}
                      className="w-full border-t border-slate-100 px-3.5 py-2.5 text-[11px] font-semibold text-accent transition-all hover:bg-accent/5"
                    >
                      Ver panel completo →
                    </button>
                  </div>
                )}

                {/* Alertas */}
                {scheduledData.stats.imminent > 0 && (
                  <button
                    className="pointer-events-auto flex items-center gap-2 rounded-full border border-warning/35 bg-white/95 backdrop-blur-sm px-3.5 py-2 text-[12px] font-semibold text-warning shadow-lg transition-all hover:shadow-xl hover:border-warning/55"
                    onClick={() => goTo(VIEWS.scheduled)}
                  >
                    <span className="relative flex h-2 w-2 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-warning" />
                    </span>
                    {scheduledData.stats.imminent} inminente{scheduledData.stats.imminent !== 1 ? 's' : ''}
                  </button>
                )}

                {/* CTAs */}
                <div className="pointer-events-auto flex items-center gap-2">
                  {queueData.stats.inQueue > 0 && (
                    <button
                      className={`flex h-11 items-center gap-2.5 rounded-full px-4 text-[12.5px] font-bold shadow-xl active:scale-[0.97] transition-all ${
                        mapPopover === 'queue'
                          ? 'bg-amber-500 text-white shadow-amber-500/40 scale-[1.02]'
                          : 'bg-amber-500 text-white shadow-amber-400/35 hover:bg-amber-400 hover:shadow-amber-400/50 hover:scale-[1.02]'
                      }`}
                      onClick={() => setMapPopover(mapPopover === 'queue' ? null : 'queue')}
                    >
                      <span className="relative flex h-2.5 w-2.5 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
                        <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
                      </span>
                      {queueData.stats.inQueue} en cola
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setMapPopover(mapPopover === 'trips' ? null : 'trips')}
                    className={`flex h-11 items-center gap-2 rounded-full px-4 text-[12.5px] font-bold shadow-xl active:scale-[0.97] transition-all ${
                      mapPopover === 'trips'
                        ? 'bg-accent text-white shadow-accent/35'
                        : 'bg-white border border-slate-200/80 text-slate-700 backdrop-blur-sm hover:bg-slate-50 hover:shadow-2xl'
                    }`}
                    title="Ver viajes"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17a2 2 0 11-4 0 2 2 0 014 0zM19 17a2 2 0 11-4 0 2 2 0 014 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10m16 0V8a1 1 0 00-1-1h-3.5M6 8h2" />
                    </svg>
                    <span className="hidden sm:inline">Viajes</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMapPopover(mapPopover === 'new-trip' ? null : 'new-trip')}
                    className={`flex h-11 items-center gap-2.5 rounded-full px-5 text-[13px] font-bold shadow-2xl active:scale-[0.97] transition-all ${
                      mapPopover === 'new-trip'
                        ? 'bg-navy-800 text-white shadow-navy-900/45'
                        : 'bg-navy-900 text-white shadow-navy-900/35 hover:bg-navy-800 hover:shadow-navy-900/50 hover:scale-[1.01]'
                    }`}
                    title="Nuevo viaje"
                  >
                    <svg className="h-4 w-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                    <span className="hidden sm:inline">Nuevo viaje</span>
                  </button>
                </div>
              </div>
            </div>

            {/* ── Panel de chofer ───────────────────────────────────── */}
            {panelDriverId ? (
              <DriverPanel
                driver={drivers.find((d) => d.id === panelDriverId)}
                onClose={() => { setPanelDriverId(null); setSelectedId(null); }}
                onAssignTrip={handleAssignTrip}
                commissionPercent={commissionPercent}
              />
            ) : null}
          </div>
        )}
      </main>
      </div>{/* end main area */}

      {/* ── Modal de asignación de viaje ───────────────────────────────────── */}
      {tripModalDriver && (
        <TripAssignModal
          driver={tripModalDriver}
          onClose={() => { setTripModalDriver(null); setPreviewRoute(null); }}
          onSuccess={handleTripSuccess}
          calculatePrice={calculatePrice}
          tariffPerKm={tariffPerKm}
          tariffBase={tariffBase}
          commissionPercent={commissionPercent}
          onRouteChange={setPreviewRoute}
        />
      )}

      {mapPopover === 'new-trip' && (
        <NewTripModal
          asPopover
          onClose={closePopover}
          onSuccess={handleNewTripSuccess}
          onRouteChange={setPreviewRoute}
          calculatePrice={calculatePrice}
          tariffPerKm={tariffPerKm}
          tariffBase={tariffBase}
          commissionPercent={commissionPercent}
        />
      )}

      {showAiAgentModal ? (
        <AiAgentConfirmModal
          enabled={whatsappAgentEnabled}
          onCancel={() => setShowAiAgentModal(false)}
          onConfirm={async (nextEnabled) => {
            await updateSetting('whatsapp_agent_enabled', nextEnabled ? 'true' : 'false');
            setShowAiAgentModal(false);
          }}
        />
      ) : null}

      <WhatsAppSessionModal
        open={whatsappGateRequired || showWhatsAppSessionModal || whatsappJustConnected}
        required={whatsappGateRequired}
        onStatusChange={(status) => {
          if (status) {
            setWhatsappSessionStatus(String(status));
            setWhatsappSessionChecked(true);
          }
        }}
        onConnected={() => {
          setWhatsappSessionStatus('connected');
          setWhatsappSessionChecked(true);
          setWhatsappJustConnected(true);
          setShowWhatsAppSessionModal(false);
          window.setTimeout(() => setWhatsappJustConnected(false), 1000);
        }}
        onClose={() => {
          if (whatsappGateRequired) return;
          setShowWhatsAppSessionModal(false);
          setWhatsappJustConnected(false);
        }}
      />

      {/* ── Broadcast de audio ─────────────────────────────────────────────── */}
      {showBroadcast && multiSelectedDrivers.length > 0 && (
        <BroadcastVoiceChat
          drivers={multiSelectedDrivers}
          onClose={() => setShowBroadcast(false)}
        />
      )}

      {voiceChatDriver ? (
        <div className="fixed bottom-6 left-1/2 z-50 w-[400px] max-w-[calc(100%-2rem)] -translate-x-1/2 overflow-hidden rounded-2xl border border-light-300/60 bg-light-50 shadow-2xl shadow-black/25 sm:left-auto sm:right-6 sm:translate-x-0">
          <div className="flex h-[min(460px,70vh)] flex-col">
            <VoiceChat
              driver={voiceChatDriver}
              onClose={() => setVoiceChatDriver(null)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Componentes de navegación
// ─────────────────────────────────────────────────────────────────────────────

function SideNavItem({ icon, label, active, onClick, badge, badgeColor = 'warning', variant = 'default', toneClass = '' }) {
  const badgeStyles = {
    warning:         'bg-amber-500 text-white',
    'warning-pulse': 'bg-amber-500 text-white animate-pulse',
    violet:          'bg-violet-500 text-white',
    accent:          'bg-accent text-white',
  };
  const baseClass = variant === 'primary'
    ? 'app-sidebar-nav-item !bg-navy-900 !text-white hover:!bg-navy-900/90'
    : variant === 'primary-sidebar'
    ? 'app-sidebar-nav-item !bg-white/15 !text-white hover:!bg-white/22'
    : `app-sidebar-nav-item${active ? ' active' : ''}${toneClass ? ` ${toneClass}` : ''}`;
  return (
    <button type="button" onClick={onClick} className={baseClass}>
      <span className="app-sidebar-icon-wrap">{icon}</span>
      <span className="app-sidebar-label flex-1 text-left truncate ml-2">{label}</span>
      {badge != null && badge > 0 && (
        <span className={`app-sidebar-label mr-1 flex-shrink-0 min-w-[18px] h-[18px] rounded-full text-[9px] font-bold flex items-center justify-center px-1 ${
          active ? 'bg-white/20 text-white' : (badgeStyles[badgeColor] || badgeStyles.warning)
        }`}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

function NavTab({ children, icon, active, onClick, badge, badgeColor = 'warning', compact = false }) {
  const badgeStyles = {
    warning:         'bg-amber-500 text-white',
    'warning-pulse': 'bg-amber-500 text-white animate-pulse',
    violet:          'bg-violet-500 text-white',
    accent:          'bg-accent text-white',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex items-center gap-1.5 rounded-xl font-semibold transition-all duration-150 select-none whitespace-nowrap ${
        compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3 py-1.5 text-[12.5px]'
      } ${
        active
          ? 'bg-navy-900 text-white shadow-[0_1px_3px_rgba(15,23,42,0.22),0_0_0_1px_rgba(15,23,42,0.08)]'
          : 'bg-transparent text-slate-500 hover:bg-white/70 hover:text-slate-800 active:scale-[0.97]'
      }`}
    >
      {icon}
      <span>{children}</span>
      {badge != null && badge > 0 && (
        <span className={`min-w-[16px] h-4 flex items-center justify-center text-[9px] font-bold rounded-full px-1 -mr-0.5 ${
          active ? 'bg-white/20 text-white' : (badgeStyles[badgeColor] || badgeStyles.warning)
        }`}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

function IconAction({ children, active, onClick, title, badge = 0 }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`relative flex h-8 w-8 items-center justify-center rounded-xl transition-all duration-150 ${
        active
          ? 'bg-navy-900 text-white shadow-sm'
          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      {children}
      {badge > 0 && (
        <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 flex items-center justify-center text-[8px] font-bold bg-violet-500 text-white rounded-full">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </button>
  );
}
