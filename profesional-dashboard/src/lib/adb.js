import { execFile } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execFileAsync = promisify(execFile);

const ADB_TIMEOUT_MS = 8000;

/** Rutas habituales de adb en Windows (Android Studio). */
const WINDOWS_SDK_CANDIDATES = [
  () => process.env.ADB_PATH,
  () => {
    const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    if (!sdk) return null;
    return path.join(sdk, 'platform-tools', 'adb.exe');
  },
  () => {
    const local = process.env.LOCALAPPDATA;
    if (!local) return null;
    return path.join(local, 'Android', 'Sdk', 'platform-tools', 'adb.exe');
  },
  () => {
    const userProfile = process.env.USERPROFILE;
    if (!userProfile) return null;
    return path.join(userProfile, 'AppData', 'Local', 'Android', 'Sdk', 'platform-tools', 'adb.exe');
  },
];

export function resolveAdbPath() {
  for (const candidate of WINDOWS_SDK_CANDIDATES) {
    const resolved = candidate();
    if (resolved && fs.existsSync(resolved)) return resolved;
  }
  return process.platform === 'win32' ? 'adb.exe' : 'adb';
}

export function isDevGpsApiEnabled() {
  if (process.env.ENABLE_EMULATOR_GPS === '1') return true;
  if (process.env.NODE_ENV === 'development') return true;
  if (process.env.VERCEL_ENV === 'preview' && process.env.ENABLE_EMULATOR_GPS === '1') return true;
  return false;
}

async function runAdb(args, { deviceId } = {}) {
  const adb = resolveAdbPath();
  const fullArgs = deviceId ? ['-s', deviceId, ...args] : args;
  const { stdout, stderr } = await execFileAsync(adb, fullArgs, {
    timeout: ADB_TIMEOUT_MS,
    windowsHide: true,
  });
  return { stdout: String(stdout || ''), stderr: String(stderr || '') };
}

/** Lista emuladores Android conectados (`adb devices`). */
export async function listEmulators() {
  const { stdout } = await runAdb(['devices']);
  const lines = stdout.split(/\r?\n/).slice(1);
  const emulators = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const [id, state, ...rest] = trimmed.split(/\s+/);
    if (!id?.startsWith('emulator-') || state !== 'device') continue;
    const modelPart = rest.find((p) => p.startsWith('model:'));
    const model = modelPart ? modelPart.replace('model:', '') : null;
    emulators.push({ id, model });
  }

  return emulators;
}

/**
 * Fija la ubicación GPS del emulador.
 * adb espera: longitude latitude [altitude]
 * @see https://developer.android.com/studio/run/emulator-console
 */
export async function setEmulatorGeo(deviceId, latitude, longitude, altitude = 0) {
  const lng = Number(longitude);
  const lat = Number(latitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error('Coordenadas inválidas');
  }

  const lngStr = lng.toFixed(8);
  const latStr = lat.toFixed(8);
  const altStr = String(Number(altitude) || 0);

  await runAdb(['emu', 'geo', 'fix', lngStr, latStr, altStr], { deviceId });
  return { latitude: lat, longitude: lng };
}

export async function checkAdbAvailable() {
  try {
    const adb = resolveAdbPath();
    await execFileAsync(adb, ['version'], { timeout: ADB_TIMEOUT_MS, windowsHide: true });
    return { ok: true, adbPath: adb };
  } catch (err) {
    return { ok: false, adbPath: resolveAdbPath(), error: err.message };
  }
}
