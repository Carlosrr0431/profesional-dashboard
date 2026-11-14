import nodemailer from 'nodemailer';

/**
 * Correo con Brevo.
 * Con BREVO_API_KEY usa la API (la clave xkeysib).
 * Si no hay clave de API, usa el SMTP (usuario + BREVO_SMTP_KEY).
 * BREVO_SENDER_EMAIL tiene que ser un remitente verificado en Brevo.
 */
const DEFAULT_SENDER_EMAIL = 'cuentas@profesionalviajes.com.ar';
const DEFAULT_SENDER_NAME = 'Profesional Viajes';

export function brevoSmtpConfig(env = process.env) {
  return {
    host: String(env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com').trim(),
    port: Number(env.BREVO_SMTP_PORT || 587),
    user: String(env.BREVO_SMTP_USER || '').trim(),
    pass: String(env.BREVO_SMTP_KEY || '').trim(),
    senderEmail: String(env.BREVO_SENDER_EMAIL || DEFAULT_SENDER_EMAIL).trim(),
    senderName: String(env.BREVO_SENDER_NAME || DEFAULT_SENDER_NAME).trim(),
  };
}

export function brevoApiPayload({ to, subject, text, senderEmail, senderName }) {
  return {
    sender: { name: senderName || 'Profesional', email: senderEmail },
    to: [{ email: to }],
    subject,
    textContent: text,
  };
}

export function brevoEmailPayload({ to, subject, text, senderEmail, senderName }) {
  const name = senderName || 'Profesional';
  return {
    from: `"${name.replace(/"/g, '')}" <${senderEmail}>`,
    to,
    subject,
    text,
  };
}

export async function sendBrevoEmail({ to, subject, text }, env = process.env) {
  const apiKey = String(env.BREVO_API_KEY || '').trim();
  const senderEmail = String(env.BREVO_SENDER_EMAIL || DEFAULT_SENDER_EMAIL).trim();
  const senderName = String(env.BREVO_SENDER_NAME || DEFAULT_SENDER_NAME).trim();
  if (apiKey) {
    if (!senderEmail) {
      return {
        ok: false,
        status: 503,
        message: 'El envío por correo no está configurado. Falta el remitente de Brevo.',
      };
    }
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify(brevoApiPayload({
        to,
        subject,
        text,
        senderEmail,
        senderName,
      })),
    });
    if (response.ok) return { ok: true };
    const body = await response.json().catch(() => ({}));
    console.error('[brevo]', response.status, body?.message || body?.code || 'api');
    return {
      ok: false,
      status: 502,
      detail: body?.message || body?.code || null,
      message: 'No pudimos enviar el código por correo. Intentá de nuevo.',
    };
  }

  const config = brevoSmtpConfig(env);
  if (!config.user || !config.pass || !config.senderEmail) {
    return {
      ok: false,
      status: 503,
      message: 'El envío por correo no está configurado. Falta la clave de Brevo en el servidor.',
    };
  }

  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });

  try {
    await transport.sendMail(brevoEmailPayload({
      to,
      subject,
      text,
      senderEmail: config.senderEmail,
      senderName: config.senderName,
    }));
    return { ok: true };
  } catch (error) {
    console.error('[brevo]', error?.message || 'smtp');
    return {
      ok: false,
      status: 502,
      message: 'No pudimos enviar el código por correo. Intentá de nuevo.',
    };
  }
}
