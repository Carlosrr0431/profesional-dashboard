import nodemailer from 'nodemailer';

/**
 * Correo por el relay SMTP de Brevo (smtp-relay.brevo.com:587).
 * BREVO_SMTP_USER es el usuario de la pantalla SMTP.
 * BREVO_SMTP_KEY es la clave SMTP, no el usuario.
 * BREVO_SENDER_EMAIL tiene que ser un remitente verificado en Brevo.
 */
export function brevoSmtpConfig(env = process.env) {
  return {
    host: String(env.BREVO_SMTP_HOST || 'smtp-relay.brevo.com').trim(),
    port: Number(env.BREVO_SMTP_PORT || 587),
    user: String(env.BREVO_SMTP_USER || '').trim(),
    pass: String(env.BREVO_SMTP_KEY || '').trim(),
    senderEmail: String(env.BREVO_SENDER_EMAIL || '').trim(),
    senderName: String(env.BREVO_SENDER_NAME || 'Profesional').trim(),
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
