import { missingApplicantDocs, normalizeApplicantEmail, applicantDraftPatch, validateApplicantProfile, vehicleRequirementError, buildAcceptedDriverInsert } from '../../src/lib/driverApplicants';
import { applicantDecisionEmail, applicantOtpEmail, brevoApiPayload, brevoEmailPayload, brevoSmtpConfig } from '../../src/lib/brevoMail';

describe('alta de chofer', () => {
  it('pide los ocho documentos y acepta un auto de 15 años', () => {
    expect(missingApplicantDocs(['dni', 'license'])).toHaveLength(6);
    expect(vehicleRequirementError({
      kind: 'car',
      year: 2011,
    }, new Date('2026-11-14'))).toBeNull();
  });

  it('rechaza una moto vieja o de menos de 110 cc', () => {
    const now = new Date('2026-11-14');
    expect(vehicleRequirementError({ kind: 'moto', year: 2010, cc: 150 }, now))
      .toMatch(/10 años/);
    expect(vehicleRequirementError({ kind: 'moto', year: 2020, cc: 100 }, now))
      .toMatch(/110 cc/);
  });

  it('rechaza un auto de más de 15 años', () => {
    expect(vehicleRequirementError({
      kind: 'car',
      year: 2010,
    }, new Date('2026-11-14'))).toMatch(/15 años/);
  });

  it('si ya verificó el correo, pide el celular y no cambia el correo', () => {
    const profile = validateApplicantProfile({
      firstName: 'Ana',
      lastName: 'Paz',
      email: 'otro@gmail.com',
      phone: '3875345465',
      dni: '30111222',
    }, { email: 'ana@gmail.com', phone: null });
    expect(profile.ok).toBe(true);
    expect(profile.mail).toBe('ana@gmail.com');
    expect(profile.phone).toBe('543875345465');
    expect(normalizeApplicantEmail('no-es-correo')).toBe('');
  });

  it('guarda un borrador parcial sin pisar el correo ya verificado', () => {
    const patch = applicantDraftPatch({
      firstName: 'Ana',
      lastName: 'Paz',
      email: 'otro@gmail.com',
      phone: '3875345465',
      dni: '12',
      vehicleKind: 'car',
      vehicleYear: '2018',
    }, { email: 'ana@gmail.com', phone: null });
    expect(patch).toEqual({
      first_name: 'Ana',
      last_name: 'Paz',
      phone: '543875345465',
      vehicle_kind: 'car',
      vehicle_year: 2018,
      vehicle_cc: null,
    });
  });

  it('arma el correo de Brevo con el remitente configurado', () => {
    expect(brevoSmtpConfig({
      BREVO_SMTP_HOST: 'smtp-relay.brevo.com',
      BREVO_SMTP_PORT: '587',
      BREVO_SMTP_USER: 'usuario@smtp-brevo.com',
      BREVO_SMTP_KEY: 'clave',
      BREVO_SENDER_EMAIL: 'avisos@profesional.ar',
    })).toMatchObject({
      host: 'smtp-relay.brevo.com',
      port: 587,
      user: 'usuario@smtp-brevo.com',
      senderEmail: 'avisos@profesional.ar',
    });
    expect(brevoApiPayload({
      to: 'ana@gmail.com',
      subject: 'Código',
      text: '1234',
      senderEmail: 'avisos@profesional.ar',
      senderName: 'Profesional',
    })).toEqual({
      sender: { name: 'Profesional', email: 'avisos@profesional.ar' },
      to: [{ email: 'ana@gmail.com' }],
      subject: 'Código',
      textContent: '1234',
    });
    expect(brevoEmailPayload({
      to: 'ana@gmail.com',
      subject: 'Código',
      text: '1234',
      senderEmail: 'avisos@profesional.ar',
      senderName: 'Profesional',
    })).toEqual({
      from: '"Profesional" <avisos@profesional.ar>',
      to: 'ana@gmail.com',
      subject: 'Código',
      text: '1234',
    });
    const otp = applicantOtpEmail('2580');
    expect(otp.html).toContain('https://www.profesionalviajes.com.ar/logo.png');
    expect(otp.html).toContain('>2<');
    expect(otp.html).toContain('>5<');
    expect(otp.html).toContain('>8<');
    expect(otp.html).toContain('>0<');
    expect(otp.text).toContain('2580');
    expect(brevoApiPayload({
      to: 'ana@gmail.com',
      subject: otp.subject,
      text: otp.text,
      html: otp.html,
      senderEmail: 'avisos@profesional.ar',
      senderName: 'Profesional',
    }).htmlContent).toContain('logo.png');
  });

  it('avisa por correo si la solicitud fue aceptada o rechazada', () => {
    const accepted = applicantDecisionEmail({ name: 'Ana Paz', accepted: true });
    const rejected = applicantDecisionEmail({ name: 'Ana Paz', accepted: false });
    expect(accepted.subject).toMatch(/aceptada/);
    expect(accepted.text).toContain('Ana Paz');
    expect(accepted.html).toContain('logo.png');
    expect(rejected.subject).not.toMatch(/aceptada/);
    expect(rejected.text).toMatch(/no podemos sumarte/);
    expect(accepted.text).toMatch(/Profesional Conductor/);
    expect(accepted.html).toContain('Aceptada');
    expect(rejected.html).toContain('Rechazada');
  });

  it('arma el chofer listo para entrar con el teléfono y el correo', () => {
    const row = buildAcceptedDriverInsert({
      first_name: 'Charly',
      last_name: 'Brown',
      email: 'giu40150135@gmail.com',
      phone: '543878630173',
      vehicle_kind: 'car',
    }, 61);
    expect(row.full_name).toBe('Charly Brown');
    expect(row.login_email).toBe('giu40150135@gmail.com');
    expect(row.phone_normalized).toBe('5493878630173');
    expect(row.driver_number).toBe(61);
    expect(row.vehicle_type).toBe('auto');
    expect(row.email_password_initialized).toBe(false);
    expect(row.password_initialized).toBe(false);
  });
});
