import { cert, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

let firebaseMessagingClient = null;

function normalizePrivateKey(privateKey) {
  return String(privateKey || '').replace(/\\n/g, '\n');
}

function readServiceAccountFromJsonEnv() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!rawJson) return null;

  let parsed = null;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT_JSON payload');
  }

  const projectId = String(parsed.project_id || parsed.projectId || '').trim();
  const clientEmail = String(parsed.client_email || parsed.clientEmail || '').trim();
  const privateKey = normalizePrivateKey(parsed.private_key || parsed.privateKey || '');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Incomplete FIREBASE_SERVICE_ACCOUNT_JSON credentials');
  }

  return { projectId, clientEmail, privateKey };
}

function readServiceAccountFromSplitEnv() {
  const projectId = String(
    process.env.FIREBASE_PROJECT_ID ||
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT ||
      ''
  ).trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || '').trim();
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY || '');

  if (!projectId || !clientEmail || !privateKey) return null;
  return { projectId, clientEmail, privateKey };
}

function getServiceAccount() {
  // Prefer split env vars to avoid passing full JSON in a single variable.
  return readServiceAccountFromSplitEnv() || readServiceAccountFromJsonEnv();
}

export function getFirebaseMessagingClient() {
  if (firebaseMessagingClient) return firebaseMessagingClient;

  const serviceAccount = getServiceAccount();
  if (!serviceAccount) {
    throw new Error(
      'Missing Firebase Admin credentials (preferred: FIREBASE_PROJECT_ID/FIREBASE_CLIENT_EMAIL/FIREBASE_PRIVATE_KEY; fallback: FIREBASE_SERVICE_ACCOUNT_JSON)'
    );
  }

  const app = getApps().length
    ? getApp()
    : initializeApp({
        credential: cert(serviceAccount),
        projectId: serviceAccount.projectId,
      });

  firebaseMessagingClient = getMessaging(app);
  return firebaseMessagingClient;
}

export function isLegacyExpoPushToken(pushToken) {
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(String(pushToken || '').trim());
}

export function isLikelyFcmToken(pushToken) {
  const token = String(pushToken || '').trim();
  if (!token) return false;
  if (isLegacyExpoPushToken(token)) return false;
  return token.length >= 24;
}

export function normalizeFcmDataPayload(rawData = {}) {
  const data = {};
  if (!rawData || typeof rawData !== 'object') return data;

  Object.entries(rawData).forEach(([key, value]) => {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;
    if (value === undefined || value === null) return;

    if (typeof value === 'string') {
      data[normalizedKey] = value;
      return;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      data[normalizedKey] = String(value);
      return;
    }

    try {
      data[normalizedKey] = JSON.stringify(value);
    } catch {
      data[normalizedKey] = String(value);
    }
  });

  return data;
}

export function isFirebaseCredentialError(value) {
  const normalized = String(value || '').toLowerCase();
  return (
    normalized.includes('push_invalid_credentials') ||
    normalized.includes('invalidcredentials') ||
    normalized.includes('invalid_credentials') ||
    normalized.includes('app/invalid-credential') ||
    normalized.includes('messaging/authentication-error') ||
    normalized.includes('messaging/mismatched-credential') ||
    normalized.includes('unable to retrieve the fcm server key') ||
    normalized.includes('fcm server key')
  );
}

export function normalizeFirebaseSendError(error) {
  const code = String(error?.code || '').trim().toLowerCase();
  const message = String(error?.message || '').trim();
  const normalizedMessage = message.toLowerCase();

  if (code === 'messaging/registration-token-not-registered') {
    return { reason: 'device_not_registered', code, message };
  }

  if (
    code === 'messaging/invalid-registration-token' ||
    (code === 'messaging/invalid-argument' && normalizedMessage.includes('registration token'))
  ) {
    return { reason: 'invalid_registration_token', code, message };
  }

  if (isFirebaseCredentialError(code) || isFirebaseCredentialError(normalizedMessage)) {
    return { reason: 'push_invalid_credentials', code, message };
  }

  return {
    reason: code || normalizedMessage || 'push_error',
    code,
    message,
  };
}
