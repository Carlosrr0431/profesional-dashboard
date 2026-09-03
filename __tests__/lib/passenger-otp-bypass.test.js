const {
  isAppReviewDemoPhone,
  isPassengerOtpBypassPhone,
  buildPassengerOtpMessage,
  otpPhraseFingerprint,
} = require('../../src/lib/passengerOtp');

describe('passenger OTP bypass phone', () => {
  const originalBypass = process.env.PASSENGER_OTP_BYPASS_PHONE;
  const originalReview = process.env.PASSENGER_APP_REVIEW_PHONE;

  afterEach(() => {
    if (originalBypass == null) delete process.env.PASSENGER_OTP_BYPASS_PHONE;
    else process.env.PASSENGER_OTP_BYPASS_PHONE = originalBypass;
    if (originalReview == null) delete process.env.PASSENGER_APP_REVIEW_PHONE;
    else process.env.PASSENGER_APP_REVIEW_PHONE = originalReview;
  });

  test('sin env no saltea ningún número, incluido el de prueba local', () => {
    delete process.env.PASSENGER_OTP_BYPASS_PHONE;
    expect(isPassengerOtpBypassPhone('3878630173')).toBe(false);
    expect(isPassengerOtpBypassPhone('543878630173')).toBe(false);
  });

  test('sin PASSENGER_APP_REVIEW_PHONE ningún número saltea WhatsApp', () => {
    delete process.env.PASSENGER_OTP_BYPASS_PHONE;
    delete process.env.PASSENGER_APP_REVIEW_PHONE;
    expect(isAppReviewDemoPhone('3878630173')).toBe(false);
    expect(isAppReviewDemoPhone('543878630173')).toBe(false);
    expect(isAppReviewDemoPhone('3871234567')).toBe(false);
  });

  test('con PASSENGER_APP_REVIEW_PHONE solo ese número es review silencioso', () => {
    delete process.env.PASSENGER_OTP_BYPASS_PHONE;
    process.env.PASSENGER_APP_REVIEW_PHONE = '3878630173';
    expect(isAppReviewDemoPhone('3878630173')).toBe(true);
    expect(isAppReviewDemoPhone('543878630173')).toBe(true);
    expect(isAppReviewDemoPhone('3871234567')).toBe(false);
  });

  test('con env acepta solo ese número en cualquier formato válido', () => {
    process.env.PASSENGER_OTP_BYPASS_PHONE = '3878630173';
    expect(isPassengerOtpBypassPhone('3878630173')).toBe(true);
    expect(isPassengerOtpBypassPhone('543878630173')).toBe(true);
    expect(isPassengerOtpBypassPhone('5493878630173')).toBe(true);
    expect(isPassengerOtpBypassPhone('+54 9 387 863-0173')).toBe(true);
    expect(isPassengerOtpBypassPhone('3871234567')).toBe(false);
    expect(isPassengerOtpBypassPhone('5493871234567')).toBe(false);
    expect(isPassengerOtpBypassPhone('')).toBe(false);
  });
});

describe('buildPassengerOtpMessage', () => {
  test('incluye el código y evita el texto de verificación que Meta marca como spam', () => {
    const text = buildPassengerOtpMessage('2580', 1_000);
    expect(text).toContain('2580');
    expect(text.toLowerCase()).not.toMatch(/verificaci[oó]n|\bcódigo\b|\bcodigo\b|\botp\b|\bnúmero\b|\bnumero\b|te pide|no lo compartas|válido por|valido por/);
    expect(text).not.toContain('*');
    expect(text).not.toContain('\n');
  });

  test('siempre es una sola frase', () => {
    for (let i = 0; i < 32; i += 1) {
      const text = buildPassengerOtpMessage('2580', i * 1000);
      expect(text).toContain('2580');
      expect(text).not.toMatch(/\n/);
      const clauses = text.split(/[.!?]+/).map((part) => part.trim()).filter(Boolean);
      expect(clauses).toHaveLength(1);
    }
  });

  test('un reenvío no reutiliza la misma plantilla', () => {
    const previous = 'Buenas noches, para subir a la app de Profesional poné 9758';
    for (let i = 0; i < 24; i += 1) {
      const next = buildPassengerOtpMessage('4859', Date.now(), { previousText: previous });
      expect(next).toContain('4859');
      expect(otpPhraseFingerprint(next)).not.toBe(otpPhraseFingerprint(previous));
    }
  });

  test('dos códigos distintos con la misma plantilla tienen la misma huella', () => {
    expect(otpPhraseFingerprint('Buenas, para subir a la app de Profesional poné 9758'))
      .toBe(otpPhraseFingerprint('Buenas, para subir a la app de Profesional poné 4859'));
  });
});
