import { NextResponse } from 'next/server';
import {
  checkAdbAvailable,
  isDevGpsApiEnabled,
  listEmulators,
  setEmulatorGeo,
} from '../../../../src/lib/adb.js';
import { getSimulatorDriverOrigin } from '../../../../src/lib/emulatorDriverOrigin.js';

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

export async function GET() {
  if (!isDevGpsApiEnabled()) return devOnlyResponse();

  const adbStatus = await checkAdbAvailable();
  if (!adbStatus.ok) {
    return NextResponse.json({
      adb: adbStatus,
      emulators: [],
      hint:
        'Instalá Android SDK Platform-Tools o definí ADB_PATH / ANDROID_HOME apuntando al SDK de Android Studio.',
    });
  }

  try {
    const [emulators, driverOrigin] = await Promise.all([
      listEmulators(),
      getSimulatorDriverOrigin().catch(() => null),
    ]);
    return NextResponse.json({ adb: adbStatus, emulators, driverOrigin });
  } catch (err) {
    return NextResponse.json(
      { adb: adbStatus, emulators: [], error: err.message },
      { status: 500 },
    );
  }
}

export async function POST(request) {
  if (!isDevGpsApiEnabled()) return devOnlyResponse();

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 });
  }

  const { deviceId, latitude, longitude } = body || {};
  if (!deviceId || typeof deviceId !== 'string') {
    return NextResponse.json({ error: 'deviceId es obligatorio' }, { status: 400 });
  }
  if (!deviceId.startsWith('emulator-')) {
    return NextResponse.json({ error: 'Solo se permiten emuladores Android' }, { status: 400 });
  }

  try {
    const position = await setEmulatorGeo(deviceId, latitude, longitude);
    return NextResponse.json({ ok: true, deviceId, position });
  } catch (err) {
    return NextResponse.json(
      { error: err.message || 'No se pudo actualizar la ubicación del emulador' },
      { status: 500 },
    );
  }
}
