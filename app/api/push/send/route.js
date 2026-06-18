import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  getFirebaseMessagingClient,
  isLegacyExpoPushToken,
  isLikelyFcmToken,
  normalizeFcmDataPayload,
  normalizeFirebaseSendError,
} from '../../../../src/lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STALE_TOKEN_REASONS = new Set(['device_not_registered', 'invalid_registration_token']);

let supabaseAdmin = null;

function getSupabaseAdmin() {
  if (supabaseAdmin) return supabaseAdmin;

  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  supabaseAdmin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return supabaseAdmin;
}

async function clearStalePassengerPushToken(passengerPhone, reason) {
  const phone = String(passengerPhone || '').trim();
  if (!phone || !STALE_TOKEN_REASONS.has(reason)) {
    return { cleared: false };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return { cleared: false, clearError: 'missing_supabase_admin' };
  }

  const { error } = await admin
    .from('passenger_devices')
    .delete()
    .eq('phone', phone);

  if (error) {
    return { cleared: false, clearError: error.message || 'passenger_push_token_clear_failed' };
  }

  return { cleared: true };
}

async function clearStaleDriverPushToken(driverId, reason) {
  const normalizedDriverId = String(driverId || '').trim();
  if (!normalizedDriverId || !STALE_TOKEN_REASONS.has(reason)) {
    return { cleared: false };
  }

  const admin = getSupabaseAdmin();
  if (!admin) {
    return { cleared: false, clearError: 'missing_supabase_admin' };
  }

  const { error } = await admin
    .from('drivers')
    .update({ push_token: null })
    .eq('id', normalizedDriverId);

  if (error) {
    return { cleared: false, clearError: error.message || 'push_token_clear_failed' };
  }

  return { cleared: true };
}

export async function POST(req) {
  const payload = await req.json().catch(() => null);
  const token = String(payload?.pushToken || '').trim();
  const title = String(payload?.title || '').trim();
  const body = String(payload?.body || '').trim();

  if (!token) {
    return NextResponse.json({ ok: false, reason: 'no_push_token' }, { status: 400 });
  }

  if (!title || !body) {
    return NextResponse.json(
      { ok: false, reason: 'invalid_payload', message: 'title y body son obligatorios' },
      { status: 400 }
    );
  }

  if (!isLikelyFcmToken(token)) {
    return NextResponse.json(
      {
        ok: false,
        reason: isLegacyExpoPushToken(token)
          ? 'legacy_expo_token_format'
          : 'invalid_push_token_format',
      },
      { status: 400 }
    );
  }

  try {
    const messageId = await getFirebaseMessagingClient().send({
      token,
      notification: { title, body },
      data: normalizeFcmDataPayload(payload?.data || {}),
      android: {
        priority: 'high',
        notification: {
          channelId: 'trips',
          sound: 'default',
        },
      },
    });

    return NextResponse.json({ ok: true, messageId: messageId || null });
  } catch (error) {
    const normalizedError = normalizeFirebaseSendError(error);
    const reason = normalizedError.reason || 'push_error';
    const statusCode =
      STALE_TOKEN_REASONS.has(reason)
        ? 410
        : reason === 'push_invalid_credentials'
          ? 503
          : 500;

    const tokenClearResult = payload?.passengerPhone
      ? await clearStalePassengerPushToken(payload.passengerPhone, reason)
      : await clearStaleDriverPushToken(payload?.driverId, reason);

    return NextResponse.json(
      {
        ok: false,
        reason,
        code: normalizedError.code || null,
        message: normalizedError.message || null,
        tokenCleared: tokenClearResult.cleared,
      },
      { status: statusCode }
    );
  }
}
