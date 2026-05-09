import { NextResponse } from 'next/server';
import {
  getFirebaseMessagingClient,
  isLegacyExpoPushToken,
  isLikelyFcmToken,
  normalizeFcmDataPayload,
  normalizeFirebaseSendError,
} from '../../../../src/lib/firebaseAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    const statusCode =
      normalizedError.reason === 'device_not_registered' ||
      normalizedError.reason === 'invalid_registration_token'
        ? 410
        : normalizedError.reason === 'push_invalid_credentials'
          ? 503
          : 500;

    return NextResponse.json(
      {
        ok: false,
        reason: normalizedError.reason || 'push_error',
        code: normalizedError.code || null,
        message: normalizedError.message || null,
      },
      { status: statusCode }
    );
  }
}
