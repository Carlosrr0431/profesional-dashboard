'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getDriverSupabase } from './driverSupabase';
import { useGeoPermission } from '../shared/geoPermission';
import { bearingDegrees } from '../shared/nav';

function parseCoord(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function applySimRow(row, prevCoords) {
  const lat = parseCoord(row?.current_lat ?? row?.lat);
  const lng = parseCoord(row?.current_lng ?? row?.lng);
  if (lat == null || lng == null) return prevCoords;
  let heading = Number.isFinite(prevCoords?.heading) ? prevCoords.heading : 0;
  let speed = 0;
  if (prevCoords && (Math.abs(prevCoords.lat - lat) > 0.000008 || Math.abs(prevCoords.lng - lng) > 0.000008)) {
    heading = bearingDegrees(
      { lat: prevCoords.lat, lng: prevCoords.lng },
      { lat, lng },
    );
    speed = 8;
  }
  return { lat, lng, heading, speed };
}

/**
 * GPS del chofer web: usa el navegador, salvo que el simulador del panel
 * tenga gps_simulation_active. En ese caso sigue current_lat/lng de Supabase
 * y no pisa esa posición con el GPS del browser.
 */
export function useDriverGps(driverId) {
  const [simulating, setSimulating] = useState(false);
  const [simReady, setSimReady] = useState(false);
  const [simCoords, setSimCoords] = useState(null);
  const simCoordsRef = useRef(null);
  const simulatingRef = useRef(false);
  const geo = useGeoPermission({
    watch: Boolean(driverId) && simReady && !simulating,
    enabled: Boolean(driverId),
  });

  const applyDriverRow = useCallback((row) => {
    const hasFlag = row != null && typeof row.gps_simulation_active !== 'undefined';
    const active = hasFlag ? Boolean(row.gps_simulation_active) : simulatingRef.current;
    simulatingRef.current = active;
    setSimulating(active);
    if (!active) {
      simCoordsRef.current = null;
      setSimCoords(null);
      return;
    }
    const next = applySimRow(row, simCoordsRef.current);
    if (!next) return;
    const prev = simCoordsRef.current;
    if (
      prev
      && Math.abs(prev.lat - next.lat) < 0.0000008
      && Math.abs(prev.lng - next.lng) < 0.0000008
    ) {
      return;
    }
    simCoordsRef.current = next;
    setSimCoords(next);
  }, []);

  useEffect(() => {
    if (!driverId) {
      setSimulating(false);
      setSimCoords(null);
      setSimReady(false);
      simCoordsRef.current = null;
      return undefined;
    }

    const supabase = getDriverSupabase();
    let cancelled = false;
    simCoordsRef.current = null;
    simulatingRef.current = false;

    const load = async () => {
      const { data } = await supabase
        .from('drivers')
        .select('gps_simulation_active, current_lat, current_lng')
        .eq('id', driverId)
        .maybeSingle();
      if (cancelled) return;
      if (data) applyDriverRow(data);
      else {
        simulatingRef.current = false;
        setSimulating(false);
      }
      setSimReady(true);
    };

    load();
    const poll = setInterval(load, 900);

    const channel = supabase
      .channel(`spa_gps_sim_${driverId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'drivers', filter: `id=eq.${driverId}` },
        (payload) => applyDriverRow(payload.new),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'driver_locations', filter: `driver_id=eq.${driverId}` },
        (payload) => {
          if (!simulatingRef.current) return;
          const next = applySimRow(payload.new, simCoordsRef.current);
          if (!next) return;
          const prev = simCoordsRef.current;
          if (
            prev
            && Math.abs(prev.lat - next.lat) < 0.0000008
            && Math.abs(prev.lng - next.lng) < 0.0000008
          ) {
            return;
          }
          simCoordsRef.current = next;
          setSimCoords(next);
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(poll);
      supabase.removeChannel(channel);
    };
  }, [applyDriverRow, driverId]);

  const coords = !simReady ? null : (simulating ? simCoords : geo.coords);

  return {
    status: geo.status,
    coords,
    request: geo.request,
    showBanner: simulating || !simReady ? false : geo.showBanner,
    simulating,
    simReady,
  };
}
