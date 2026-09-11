/** @jest-environment node */

import {
  pickDriverGps,
  mergeSnapshotKeepingFresherGps,
  gpsTimestampForCoordChange,
  applyDriverLocationRealtime,
  pinMoveDurationMs,
  haversineMeters,
  extrapolateGps,
  inferPinMotion,
  nextGpsFromDriverRow,
  MAX_GPS_EXTRAPOLATE_MS,
} from '../../src/lib/driverMapGps';

describe('pickDriverGps', () => {
  const now = Date.parse('2026-09-06T20:00:00.000Z');
  const driver = {
    current_lat: -24.79,
    current_lng: -65.41,
    updated_at: '2026-09-06T19:59:58.000Z',
  };

  it('prioriza current_lat si es más nuevo que driver_locations', () => {
    const gps = pickDriverGps({
      lat: -24.78,
      lng: -65.42,
      updated_at: '2026-09-06T19:59:57.000Z',
      speed: 12,
      heading: 90,
    }, driver, now);

    expect(gps.lat).toBe(-24.79);
    expect(gps.lng).toBe(-65.41);
    expect(gps.speed).toBe(12);
    expect(gps.heading).toBe(90);
  });

  it('usa current_lat si driver_locations está viejo o distinto', () => {
    const gps = pickDriverGps({
      lat: -24.70,
      lng: -65.30,
      updated_at: '2026-09-06T19:00:00.000Z',
    }, driver, now);

    expect(gps.lat).toBe(-24.79);
    expect(gps.lng).toBe(-65.41);
  });

  it('cae a current_lat si no hay fila de locations', () => {
    const gps = pickDriverGps(null, driver, now);
    expect(gps.lat).toBe(-24.79);
    expect(gps.lng).toBe(-65.41);
  });

  it('cae a driver_locations si no hay current_lat', () => {
    const gps = pickDriverGps({
      lat: -24.78,
      lng: -65.42,
      updated_at: '2026-09-06T19:59:57.000Z',
    }, { current_lat: null, current_lng: null }, now);

    expect(gps.lat).toBe(-24.78);
    expect(gps.lng).toBe(-65.42);
  });

  it('usa driver_locations si su timestamp es más nuevo', () => {
    const gps = pickDriverGps({
      lat: -24.78,
      lng: -65.42,
      updated_at: '2026-09-06T20:00:02.000Z',
      speed: 9,
    }, driver, now);

    expect(gps.lat).toBe(-24.78);
    expect(gps.lng).toBe(-65.42);
    expect(gps.speed).toBe(9);
  });
});

describe('mergeSnapshotKeepingFresherGps', () => {
  it('no pisa un GPS realtime más nuevo con el poll', () => {
    const prev = [{
      id: 'd1',
      lat: -24.801,
      lng: -65.411,
      updatedAt: '2026-09-06T20:00:05.000Z',
      isAvailable: true,
      isOnline: true,
      fullName: 'Juan',
    }];
    const next = [{
      id: 'd1',
      lat: -24.70,
      lng: -65.30,
      updatedAt: '2026-09-06T19:59:00.000Z',
      isAvailable: true,
      isOnline: true,
      fullName: 'Juan',
      pendingCommission: 10,
    }];

    const merged = mergeSnapshotKeepingFresherGps(prev, next);
    expect(merged[0].lat).toBe(-24.801);
    expect(merged[0].lng).toBe(-65.411);
    expect(merged[0].pendingCommission).toBe(10);
  });

  it('nunca pisa el GPS local con el snapshot/poll', () => {
    const prev = [{
      id: 'd1',
      lat: -24.70,
      lng: -65.30,
      speed: 8,
      heading: 90,
      updatedAt: '2026-09-06T19:59:00.000Z',
      isAvailable: true,
    }];
    const next = [{
      id: 'd1',
      lat: -24.801,
      lng: -65.411,
      speed: 1,
      heading: 10,
      updatedAt: '2026-09-06T20:00:05.000Z',
      isAvailable: true,
      pendingCommission: 4,
    }];

    const merged = mergeSnapshotKeepingFresherGps(prev, next);
    expect(merged[0].lat).toBe(-24.70);
    expect(merged[0].lng).toBe(-65.30);
    expect(merged[0].speed).toBe(8);
    expect(merged[0].heading).toBe(90);
    expect(merged[0].pendingCommission).toBe(4);
  });
});

describe('extrapolateGps', () => {
  it('avanza al norte a la velocidad del celular', () => {
    const next = extrapolateGps(-24.8, -65.4, 10, 0, 1000);
    const moved = haversineMeters(-24.8, -65.4, next.lat, next.lng);
    expect(moved).toBeGreaterThan(9.5);
    expect(moved).toBeLessThan(10.5);
    expect(next.lat).toBeGreaterThan(-24.8);
    expect(next.lng).toBeCloseTo(-65.4, 6);
  });

  it('avanza al este a la velocidad del celular', () => {
    const next = extrapolateGps(-24.8, -65.4, 10, 90, 1000);
    const moved = haversineMeters(-24.8, -65.4, next.lat, next.lng);
    expect(moved).toBeGreaterThan(9.5);
    expect(moved).toBeLessThan(10.5);
    expect(next.lng).toBeGreaterThan(-65.4);
  });

  it('no inventa más de MAX_GPS_EXTRAPOLATE_MS', () => {
    const capped = extrapolateGps(-24.8, -65.4, 10, 0, MAX_GPS_EXTRAPOLATE_MS);
    const longer = extrapolateGps(-24.8, -65.4, 10, 0, 10_000);
    expect(longer.lat).toBeCloseTo(capped.lat, 8);
    expect(longer.lng).toBeCloseTo(capped.lng, 8);
  });

  it('se queda quieto si no hay velocidad', () => {
    expect(extrapolateGps(-24.8, -65.4, 0, 90, 1000)).toEqual({ lat: -24.8, lng: -65.4 });
    expect(extrapolateGps(-24.8, -65.4, -1, 90, 1000)).toEqual({ lat: -24.8, lng: -65.4 });
  });
});

describe('inferPinMotion', () => {
  it('usa el rumbo del desplazamiento si no hay speed de heartbeat', () => {
    const motion = inferPinMotion({
      fromLat: -24.8,
      fromLng: -65.4,
      toLat: -24.8,
      toLng: -65.399,
      reportedSpeed: 0,
      reportedHeading: 0,
      intervalMs: 1000,
    });
    expect(motion.heading).toBeGreaterThan(80);
    expect(motion.heading).toBeLessThan(100);
    expect(motion.speed).toBeGreaterThan(5);
  });

  it('prioriza la velocidad reportada del celular', () => {
    const motion = inferPinMotion({
      fromLat: -24.8,
      fromLng: -65.4,
      toLat: -24.80001,
      toLng: -65.4,
      reportedSpeed: 14,
      reportedHeading: 0,
      intervalMs: 1000,
    });
    expect(motion.speed).toBe(14);
  });
});

describe('nextGpsFromDriverRow', () => {
  it('aplica current_lat live aunque updated_at del chofer sea viejo', () => {
    const next = nextGpsFromDriverRow(
      { lat: -24.80, lng: -65.40, updatedAt: '2026-09-06T20:00:05.000Z' },
      {
        current_lat: -24.801,
        current_lng: -65.401,
        updated_at: '2026-09-06T19:59:00.000Z',
      },
    );
    expect(next.lat).toBe(-24.801);
    expect(next.lng).toBe(-65.401);
  });

  it('no cambia coords si el UPDATE no movió current_lat', () => {
    const next = nextGpsFromDriverRow(
      { lat: -24.80, lng: -65.40, updatedAt: '2026-09-06T20:00:05.000Z' },
      {
        current_lat: -24.80,
        current_lng: -65.40,
        updated_at: '2026-09-06T20:00:10.000Z',
      },
    );
    expect(next.lat).toBe(-24.80);
    expect(next.updatedAt).toBe('2026-09-06T20:00:05.000Z');
  });
});

describe('applyDriverLocationRealtime', () => {
  const base = [{
    id: 'd1',
    lat: -24.80,
    lng: -65.40,
    speed: 0,
    heading: 0,
    updatedAt: '2026-09-06T20:00:00.000Z',
    isAvailable: true,
    isOnline: true,
  }];

  it('aplica lat/lng del heartbeat aunque speed no cambie', () => {
    const next = applyDriverLocationRealtime(base, {
      driver_id: 'd1',
      lat: -24.801,
      lng: -65.401,
      speed: 0,
      heading: 0,
      updated_at: '2026-09-06T20:00:02.000Z',
    });
    expect(next[0].lat).toBe(-24.801);
    expect(next[0].lng).toBe(-65.401);
    expect(next).not.toBe(base);
  });

  it('no pisa un GPS local más nuevo con un heartbeat viejo', () => {
    const next = applyDriverLocationRealtime(base, {
      driver_id: 'd1',
      lat: -24.70,
      lng: -65.30,
      speed: 11,
      heading: 40,
      updated_at: '2026-09-06T19:59:00.000Z',
    });
    expect(next[0].lat).toBe(-24.80);
    expect(next[0].lng).toBe(-65.40);
    expect(next[0].speed).toBe(11);
  });
});

describe('pinMoveDurationMs', () => {
  it('usa distancia / velocidad en movimiento', () => {
    expect(pinMoveDurationMs(14, 14)).toBe(1000);
    expect(haversineMeters(-24.8, -65.4, -24.8, -65.4)).toBe(0);
  });

  it('acota saltos sin velocidad', () => {
    expect(pinMoveDurationMs(20, 0)).toBe(650);
    expect(pinMoveDurationMs(0, 10)).toBe(0);
  });
});

describe('gpsTimestampForCoordChange', () => {
  it('usa now si el updated_at del chofer no es más nuevo', () => {
    expect(gpsTimestampForCoordChange(
      '2026-09-06T20:00:05.000Z',
      '2026-09-06T19:59:00.000Z',
      '2026-09-06T20:00:06.000Z',
    )).toBe('2026-09-06T20:00:06.000Z');
  });
});
