/**
 * Correo transaccional con Brevo.
 * Requiere BREVO_API_KEY y BREVO_SENDER_EMAIL en el servidor.
 */
export function brevoEmailPayload({ to, subject, text, senderEmail, senderName }) {
  return {
    sender: {
      name: senderName || 'Profesional',
      email: senderEmail,
    },
    to: [{ email: to }],
    subject,
    textContent: text,
  };
}

export async function sendBrevoEmail({ to, subject, text }, env = process.env) {
  const apiKey = String(env.BREVO_API_KEY || '').trim();
  const senderEmail = String(env.BREVO_SENDER_EMAIL || '').trim();
  const senderName = String(env.BREVO_SENDER_NAME || 'Profesional').trim();
  if (!apiKey || !senderEmail) {
    return {
      ok: false,
      status: 503,
      message: 'El envío por correo no está configurado. Falta la clave de Brevo en el servidor.',
    };
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(brevoEmailPayload({
      to,
      subject,
      text,
      senderEmail,
      senderName,
    })),
  });

  if (response.ok) return { ok: true };
  return {
    ok: false,
    status: 502,
    message: 'No pudimos enviar el código por correo. Intentá de nuevo.',
  };
}
