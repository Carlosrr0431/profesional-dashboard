import { useState, useRef, useCallback, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { usePathname, useRouter } from 'next/navigation';
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
import DriverManagement from './components/DriverManagement';
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
  const pathname = usePathname();
  const { signOut, user } = useAdminAuth();
  const isSuperAdmin = isSuperAdminUser(user);
  const { drivers, loading } = useDrivers();
  const pendingPassengers = usePendingPassengers();
  const queueData = useQueuedPassengers();
  const [tripsDate, setTripsDate] = useState(() => toLocalDateInputValue());
  const liveTripsData = useLiveTrips(tripsDate);
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
  const [showNewTripModal, setShowNewTripModal] = useState(false);
  const [showAiAgentModal, setShowAiAgentModal] = useState(false);
  const [currentView,     setCurrentView]     = useState(() => viewFromPath(pathname));
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [multiSelectedIds,setMultiSelectedIds]= useState(new Set());
  const [showBroadcast,   setShowBroadcast]   = useState(false);
  const [voiceChatDriver, setVoiceChatDriver] = useState(null);
  // Ruta de preview al asignar viaje: { polylineCoords?, origin, destination? } | null
  const [previewRoute,    setPreviewRoute]    = useState(null);
  const [fleetDrawerOpen,   setFleetDrawerOpen] = useState(false);
  const [isDesktopLayout,   setIsDesktopLayout] = useState(false);

  const mapRef = useRef(null);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const syncLayout = () => setIsDesktopLayout(media.matches);
    syncLayout();
    media.addEventListener('change', syncLayout);
    return () => media.removeEventListener('change', syncLayout);
  }, []);

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
    if (pathname !== nextPath) {
      router.push(nextPath);
    }
  }, [isSuperAdmin, pathname, router]);

  useEffect(() => {
    let next = viewFromPath(pathname);
    if (
      !isSuperAdmin
      && (next === VIEWS.adminUsers || next === VIEWS.emulatorGps)
    ) {
      next = VIEWS.map;
      if (pathname !== DASHBOARD_BASE) {
        router.replace(DASHBOARD_BASE);
      }
    }
    setCurrentView(next);
  }, [pathname, isSuperAdmin, router]);

  useEffect(() => {
    if (panelDriverId) setFleetDrawerOpen(false);
  }, [panelDriverId]);

  useEffect(() => {
    if (currentView !== VIEWS.map) setFleetDrawerOpen(false);
  }, [currentView]);

  const handleNewTripSuccess = useCallback(() => {
    setShowNewTripModal(false);
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

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[linear-gradient(180deg,#f8f9fc_0%,#eef1f6_100%)]">

      {/* ══════════════════════════════════════════════════════════════════════
          BARRA DE NAVEGACIÓN SUPERIOR
      ══════════════════════════════════════════════════════════════════════ */}
      <header className="z-30 shrink-0 border-b border-gray-100 bg-white">
        <div className="flex h-12 items-center gap-2 px-3 lg:h-14 lg:gap-4 lg:px-5">

        {/* ── Logo ─────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center">
          <DashboardBrand imageClassName="h-8 w-auto max-w-[118px] object-contain lg:h-9 lg:max-w-[132px]" />
        </div>

        <nav className="hidden flex-1 items-center justify-center lg:flex">
          <div className="flex items-center gap-1.5 rounded-xl border border-gray-200/70 bg-gray-100/80 p-1">
            {renderNavigation(false)}
          </div>
        </nav>

        {/* ── Acciones ─────────────────────────────────────────────────── */}
        <div className="ml-auto flex shrink-0 items-center gap-1 lg:gap-1.5">
          <button
            type="button"
            onClick={() => setShowAiAgentModal(true)}
            className={`flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12px] font-semibold transition-all lg:px-3 ${
              whatsappAgentEnabled
                ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
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

          <div className="hidden h-5 w-px bg-gray-200 md:block" />

          <button
            type="button"
            onClick={() => setShowNewTripModal(true)}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-navy-900 px-2.5 text-[12px] font-semibold text-white transition-colors hover:bg-navy-900/85 lg:px-3.5"
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

        <nav className="border-t border-gray-100 px-2 py-2 lg:hidden">
          <div className="overflow-x-auto pb-0.5 scrollbar-none">
            <div className="flex w-max items-center gap-1 rounded-xl border border-gray-200/70 bg-gray-100/80 p-1">
              {renderNavigation(true)}
            </div>
          </div>
        </nav>
      </header>

      {/* ══════════════════════════════════════════════════════════════════════
          CONTENIDO PRINCIPAL
      ══════════════════════════════════════════════════════════════════════ */}
      <main className="flex-1 min-h-0 flex overflow-hidden">

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
          <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
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
                <div className={isDesktopLayout ? 'flex shrink-0' : 'fixed inset-0 z-50 flex'}>
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

            <div className="relative min-h-0 flex-1 overflow-hidden border-l border-t border-light-300/40 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)] lg:rounded-tl-3xl">
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
                  className="pointer-events-auto absolute bottom-4 left-4 z-20 flex items-center gap-2 rounded-2xl border border-light-300/70 bg-white/95 px-3.5 py-2.5 text-[12px] font-bold text-navy-900 shadow-lg shadow-navy-900/10 backdrop-blur-md transition hover:bg-white lg:hidden"
                >
                  <svg className="h-4 w-4 text-navy-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  Flota
                  <span className="rounded-full bg-navy-900 px-1.5 py-0.5 text-[10px] font-bold text-white tabular-nums">
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

              {/* ── Indicadores flotantes de alertas ─────────────────── */}
              <div className="pointer-events-none absolute bottom-20 right-3 z-10 flex flex-col items-end gap-2 sm:bottom-4 sm:right-4">
                {scheduledData.stats.imminent > 0 && (
                  <button
                    className="pointer-events-auto flex max-w-[calc(100vw-6.5rem)] items-center gap-2 rounded-xl border border-warning/40 bg-white px-2.5 py-2 shadow-lg shadow-warning/15 transition-all hover:border-warning/60 hover:shadow-xl sm:max-w-none sm:px-3"
                    onClick={() => goTo(VIEWS.scheduled)}
                    title="Ver viajes inminentes"
                  >
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-warning opacity-75" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-warning" />
                    </span>
                    <span className="truncate text-[11px] font-bold text-warning sm:text-[12px]">
                      {scheduledData.stats.imminent} inminente{scheduledData.stats.imminent !== 1 ? 's' : ''}
                    </span>
                    <svg className="h-3.5 w-3.5 shrink-0 text-warning/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
                {queueData.stats.inQueue > 0 && (
                  <button
                    className="pointer-events-auto flex max-w-[calc(100vw-6.5rem)] items-center gap-2 rounded-xl border border-accent/30 bg-white px-2.5 py-2 shadow-lg shadow-accent/10 transition-all hover:border-accent/50 hover:shadow-xl sm:max-w-none sm:px-3"
                    onClick={() => {
                      setTripsDate(toLocalDateInputValue());
                      goTo(VIEWS.trips);
                    }}
                    title="Ver cola de espera"
                  >
                    <span className="relative flex h-2.5 w-2.5 shrink-0">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-60" />
                      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-accent" />
                    </span>
                    <span className="truncate text-[11px] font-bold text-accent sm:text-[12px]">
                      {queueData.stats.inQueue} en cola
                    </span>
                    <svg className="h-3.5 w-3.5 shrink-0 text-accent/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                )}
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

      {showNewTripModal && (
        <NewTripModal
          onClose={() => { setShowNewTripModal(false); setPreviewRoute(null); }}
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
      className={`relative flex items-center gap-1.5 rounded-lg font-semibold transition-all duration-150 select-none border whitespace-nowrap ${
        compact ? 'px-2.5 py-1.5 text-[11px]' : 'px-3.5 py-2 text-[12.5px]'
      } ${
        active
          ? 'bg-navy-900 text-white border-navy-900 shadow-sm'
          : 'bg-white text-gray-600 border-gray-200/90 shadow-sm hover:text-navy-900 hover:border-gray-300 hover:bg-gray-50 active:scale-[0.98]'
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
      className={`relative w-8 h-8 rounded-lg flex items-center justify-center transition-all duration-150 ${
        active
          ? 'bg-navy-900 text-white'
          : 'text-gray-400 hover:text-gray-700 hover:bg-gray-100'
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
