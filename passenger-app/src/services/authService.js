const DASHBOARD_URL =
  process.env.EXPO_PUBLIC_DASHBOARD_URL || 'https://profesional-dashboard.vercel.app';

async function parseJsonResponse(response) {
  const data = await response.json().catch(() => ({}));
  return { data, ok: response.ok, status: response.status };
}

export async function sendPassengerOtp(phone) {
  try {
    const response = await fetch(`${DASHBOARD_URL}/api/auth/passenger/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone }),
    });

    const { data, ok, status } = await parseJsonResponse(response);

    if (status === 404) {
      return {
        ok: false,
        message: 'El servidor aún no tiene activado el login por WhatsApp. Contactá al operador.',
      };
    }

    if (!ok || !data?.ok) {
      return {
        ok: false,
        message: data?.message || 'No pudimos enviar el código. Intentá de nuevo.',
      };
    }

    return {
      ok: true,
      phone: data.phone,
      maskedPhone: data.maskedPhone,
      expiresInSeconds: data.expiresInSeconds,
      message: data.message,
    };
  } catch {
    return {
      ok: false,
      message: 'Sin conexión al servidor. Verificá tu internet o la URL del dashboard.',
    };
  }
}

export async function verifyPassengerOtp(phone, code) {
  const response = await fetch(`${DASHBOARD_URL}/api/auth/passenger/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });

  const { data, ok } = await parseJsonResponse(response);
  if (!ok || !data?.ok) {
    return {
      ok: false,
      message: data?.message || 'Código incorrecto o expirado.',
    };
  }

  return {
    ok: true,
    phone: data.phone,
    sessionToken: data.sessionToken,
    sessionExpiresAt: data.sessionExpiresAt,
    name: data.name,
  };
}

export async function validatePassengerSession(phone, sessionToken) {
  try {
    const response = await fetch(`${DASHBOARD_URL}/api/auth/passenger/validate-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, sessionToken }),
    });

    const { data, ok, status } = await parseJsonResponse(response);
    if (!ok || !data?.ok) {
      return {
        ok: false,
        message: data?.message || 'Sesión expirada.',
        expired: status === 401,
      };
    }

    return {
      ok: true,
      phone: data.phone,
      sessionToken: data.sessionToken,
      sessionExpiresAt: data.sessionExpiresAt,
      name: data.name,
    };
  } catch {
    return { ok: false, message: 'Sin conexión.', networkError: true };
  }
}

export async function registerPassengerPushToken({ phone, sessionToken, pushToken }) {
  try {
    const response = await fetch(`${DASHBOARD_URL}/api/auth/passenger/register-push-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, sessionToken, pushToken }),
    });

    const { data, ok, status } = await parseJsonResponse(response);

    if (status === 404) {
      return { ok: false, message: 'El servidor aún no soporta notificaciones push.' };
    }

    if (!ok || !data?.ok) {
      return {
        ok: false,
        message: data?.message || 'No pudimos registrar las notificaciones.',
      };
    }

    return {
      ok: true,
      phone: data.phone,
      syncedPushes: data.syncedPushes || 0,
    };
  } catch {
    return { ok: false, message: 'Sin conexión al registrar notificaciones.' };
  }
}
