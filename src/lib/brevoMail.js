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

export function brevoApiPayload({ to, subject, text, html, senderEmail, senderName }) {
  const payload = {
    sender: { name: senderName || DEFAULT_SENDER_NAME, email: senderEmail },
    to: [{ email: to }],
    subject,
    textContent: text,
  };
  if (html) payload.htmlContent = html;
  return payload;
}

export function brevoEmailPayload({ to, subject, text, html, senderEmail, senderName }) {
  const name = senderName || DEFAULT_SENDER_NAME;
  const payload = {
    from: `"${name.replace(/"/g, '')}" <${senderEmail}>`,
    to,
    subject,
    text,
  };
  if (html) payload.html = html;
  return payload;
}

const LOGO_URL = 'https://www.profesionalviajes.com.ar/logo.png';

export function applicantOtpEmail(code) {
  const digits = String(code || '').replace(/\D/g, '').slice(0, 4);
  const cells = digits.split('').map((digit) => (
    `<td align="center" width="56" height="64" style="width:56px;height:64px;background:#eef1fa;border-radius:14px;font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:64px;font-weight:700;color:#282e69;">${digit}</td>`
  )).join('<td width="10" style="width:10px;font-size:0;line-height:0;">&nbsp;</td>');

  const html = `<!DOCTYPE html>
<html lang="es">
<body style="margin:0;padding:0;background:#eef1f8;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1f8;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:24px;">
          <tr>
            <td align="center" style="padding:40px 32px 8px;">
              <img src="${LOGO_URL}" width="220" alt="Profesional" style="display:block;width:220px;max-width:220px;height:auto;border:0;outline:none;text-decoration:none;">
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:20px 32px 0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:28px;font-weight:700;color:#282e69;">
              Tu código para sumarte
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:10px 40px 0;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:22px;color:#5c6578;">
              Ingresalo en la app de Profesional Conductor. Vence en 10 minutos.
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:28px 24px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" align="center">
                <tr>${cells}</tr>
              </table>
            </td>
          </tr>
          <tr>
            <td align="center" style="padding:8px 40px 36px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:#8b93a7;">
              Si no pediste este código, podés ignorar este mensaje.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return {
    subject: 'Tu código de Profesional Conductor',
    text: `Tu código para sumarte como chofer es ${digits}. Vence en 10 minutos. Si no lo pediste, ignorá este mensaje.`,
    html,
  };
}

export async function sendBrevoEmail({ to, subject, text, html }, env = process.env) {
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
        html,
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
      html,
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
