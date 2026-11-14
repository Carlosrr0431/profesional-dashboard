import { missingApplicantDocs, normalizeApplicantEmail, validateApplicantProfile, vehicleRequirementError } from '../../src/lib/driverApplicants';
import { brevoApiPayload, brevoEmailPayload, brevoSmtpConfig } from '../../src/lib/brevoMail';

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
  });
});
