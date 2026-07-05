import { NextResponse } from 'next/server';
import {
  checkAdbAvailable,
  isDevGpsApiEnabled,
  listEmulators,
  setEmulatorGeo,
} from '../../../../src/lib/adb.js';
import {
  getSimulatorDriverOrigin,
  listSimulatorDrivers,
  setGpsSimulationMode,
  setSimulatorDriverPosition,
} from '../../../../src/lib/emulatorDriverOrigin.js';
import { requireSuperAdminUser } from '../../../../src/lib/adminAuthServer';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function devOnlyResponse() {
  return NextResponse.json(
    {
      error:
        'Simulador GPS solo disponible en desarrollo local. Ejecutá `npm run dev` y configurá ANDROID_HOME o ADB_PATH si adb no está en el PATH.',
    },
    { status: 403 },
  );
}

async function requireSuperAdmin(request) {
  const auth = await requireSuperAdminUser(request);
  if (!auth.user) {
    return NextResponse.json({ error: auth.error || 'No autorizado' }, { status: auth.status });
  }
  return null;
}

function parseCoords(latitude, longitude) {
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }
  return { lat, lng };
}

export async function GET(request) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  if (!isDevGpsApiEnabled()) return devOnlyResponse();

  const driverId = new URL(request.url).searchParams.get('driverId') || undefined;

  const adbStatus = await checkAdbAvailable();

  try {
    const [emulators, driverOrigin, drivers] = await Promise.all([
      adbStatus.ok ? listEmulators() : Promise.resolve([]),
      getSimulatorDriverOrigin({ driverId }).catch(() => null),
      listSimulatorDrivers().catch(() => []),
    ]);

    if (!adbStatus.ok) {
      return NextResponse.json({
        adb: adbStatus,
        emulators: [],
        drivers,
        driverOrigin,
        hint:
          'Sin emulador ADB: podés simular igual arrastrando el pin (actualiza current_lat/lng en Supabase).',
      });
    }

    return NextResponse.json({ adb: adbStatus, emulators, driverOrigin, drivers });
  } catch (err) {
    return NextResponse.json(
      { adb: adbStatus, emulators: [], drivers: [], error: err.message },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  if (!isDevGpsApiEnabled()) return devOnlyResponse();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { deviceId, driverId, latitude, longitude } = body || {};
  const coords = parseCoords(latitude, longitude);
  if (!coords) {
    return NextResponse.json({ error: 'latitude y longitude son obligatorias' }, { status: 400 });
  }

  const hasEmulator = typeof deviceId === 'string' && deviceId.startsWith('emulator-');
  const hasDriver = typeof driverId === 'string' && driverId.length > 0;

  if (!hasEmulator && !hasDriver) {
    return NextResponse.json(
      { error: 'Indicá driverId (celular/APK) o deviceId (emulador Android)' },
      { status: 400 },
    );
  }

  if (hasEmulator && !deviceId.startsWith('emulator-')) {
    return NextResponse.json({ error: 'Solo se permiten emuladores Android' }, { status: 400 });
  }

  try {
    const result = { ok: true, position: coords };

    if (hasDriver) {
      result.database = await setSimulatorDriverPosition(driverId, coords.lat, coords.lng);
    }

    if (hasEmulator) {
      result.emulator = await setEmulatorGeo(deviceId, coords.lat, coords.lng);
      result.deviceId = deviceId;
    }

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'No se pudo actualizar la ubicación simulada' },
      { status: 500 },
    );
  }
}

export async function PATCH(request) {
  const denied = await requireSuperAdmin(request);
  if (denied) return denied;
  if (!isDevGpsApiEnabled()) return devOnlyResponse();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { driverId, active } = body || {};
  if (!driverId || typeof driverId !== 'string') {
    return NextResponse.json({ error: 'driverId es obligatorio' }, { status: 400 });
  }
  if (typeof active !== 'boolean') {
    return NextResponse.json({ error: 'active (boolean) es obligatorio' }, { status: 400 });
  }

  try {
    const result = await setGpsSimulationMode(driverId, active);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'No se pudo cambiar el modo simulación' },
      { status: 500 },
    );
  }
}
