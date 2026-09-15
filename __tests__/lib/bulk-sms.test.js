/**
 * @jest-environment node
 */

const {
  SMS_BULK_INTERVAL_MS,
  SMS_BULK_MAX_RECIPIENTS,
  composeBulkSmsText,
  estimateBulkSmsDurationMs,
  formatPhoneLocal,
  isSmsQuietHours,
  nextSmsSendWindow,
  parseBulkSmsRecipients,
  smsSegmentCount,
} = require('../../src/lib/bulkSms');

describe('parseBulkSmsRecipients', () => {
  test('normaliza pegado mixto, saca el 9 de WhatsApp y deduplica', () => {
    const parsed = parseBulkSmsRecipients(`
      3878630173
      +54 9 387 863-0173
      3875550100; 3875550200
      1111111111
      no-es-telefono
    `);

    expect(parsed.valid.map((item) => item.local)).toEqual([
      '3878630173',
      '3875550100',
      '3875550200',
    ]);
    expect(parsed.duplicates).toEqual([
      expect.objectContaining({ local: '3878630173' }),
    ]);
    expect(parsed.invalid.map((item) => item.raw)).toEqual([
      '1111111111',
      'no-es-telefono',
    ]);
  });

  test('acepta coma, punto y coma y tabulaciones', () => {
    const parsed = parseBulkSmsRecipients('3878630173;3875550100\t3875550200');
    expect(parsed.valid).toHaveLength(3);
  });
});

describe('composeBulkSmsText', () => {
  test('agrega el link y la foto como URL, sin adjunto MMS', () => {
    const text = composeBulkSmsText({
      body: 'Viajá con Profesional',
      link: 'www.profesionalviajes.com.ar',
      imageUrl: 'https://cdn.example/promo.jpg',
    });
    expect(text).toContain('Viajá con Profesional');
    expect(text).toContain('https://www.profesionalviajes.com.ar');
    expect(text).toContain('Foto: https://cdn.example/promo.jpg');
    expect(text).not.toMatch(/mms|base64|attachment/i);
  });

  test('no duplica el link si ya está en el cuerpo', () => {
    const text = composeBulkSmsText({
      body: 'Mirá https://www.profesionalviajes.com.ar',
      link: 'https://www.profesionalviajes.com.ar',
    });
    expect(text).toBe('Mirá https://www.profesionalviajes.com.ar');
  });

  test('en WhatsApp la imagen no se mete como link: va por multimedia', () => {
    const { BULK_CHANNEL_WHATSAPP } = require('../../src/lib/bulkSms');
    const text = composeBulkSmsText({
      body: 'Promo de hoy',
      link: 'https://www.profesionalviajes.com.ar',
      imageUrl: 'https://cdn.example/promo.jpg',
      channel: BULK_CHANNEL_WHATSAPP,
    });
    expect(text).toBe('Promo de hoy\nhttps://www.profesionalviajes.com.ar');
    expect(text).not.toContain('Foto:');
  });
});

describe('smsSegmentCount y ETA', () => {
  test('un texto corto GSM es 1 segmento', () => {
    expect(smsSegmentCount('Hola Profesionales')).toBe(1);
  });

  test('con acentos cuenta como UCS-2', () => {
    expect(smsSegmentCount('á'.repeat(71))).toBe(2);
  });

  test('estima duración por el intervalo de cola', () => {
    const { WHATSAPP_BULK_INTERVAL_MS, BULK_CHANNEL_WHATSAPP } = require('../../src/lib/bulkSms');
    expect(estimateBulkSmsDurationMs(1)).toBe(0);
    expect(estimateBulkSmsDurationMs(3)).toBe(2 * SMS_BULK_INTERVAL_MS);
    expect(estimateBulkSmsDurationMs(3, BULK_CHANNEL_WHATSAPP)).toBe(2 * WHATSAPP_BULK_INTERVAL_MS);
    expect(WHATSAPP_BULK_INTERVAL_MS).toBe(30_000);
    expect(SMS_BULK_MAX_RECIPIENTS).toBe(300);
  });

  test('formatea el local para la UI', () => {
    expect(formatPhoneLocal('3878630173')).toBe('387 863-0173');
  });
});

describe('horario silencioso ART', () => {
  test('de noche espera a las 09:00 de Salta', () => {
    const night = new Date('2026-09-15T02:30:00.000Z'); // 23:30 ART del 14
    expect(isSmsQuietHours(night)).toBe(true);
    expect(nextSmsSendWindow(night, true).toISOString()).toBe('2026-09-15T12:00:00.000Z');
  });

  test('a la mañana temprano espera al mismo día 09:00', () => {
    const morning = new Date('2026-09-15T11:00:00.000Z'); // 08:00 ART
    expect(isSmsQuietHours(morning)).toBe(true);
    expect(nextSmsSendWindow(morning, true).toISOString()).toBe('2026-09-15T12:00:00.000Z');
  });

  test('de día sale ya, o si se desactiva el silencio', () => {
    const noon = new Date('2026-09-15T16:00:00.000Z'); // 13:00 ART
    expect(isSmsQuietHours(noon)).toBe(false);
    expect(nextSmsSendWindow(noon, true).toISOString()).toBe(noon.toISOString());
    const night = new Date('2026-09-15T02:30:00.000Z');
    expect(nextSmsSendWindow(night, false).toISOString()).toBe(night.toISOString());
  });
});

describe('línea de WhatsApp para difusión', () => {
  test('nunca usa la línea de OTP de pasajeros', () => {
    const previous = process.env.WHATSMEOW_LINES;
    process.env.WHATSMEOW_LINES = JSON.stringify([
      { phone: '5493872138777', agent_code: 'Profesional_Pasajeros' },
      { phone: '5493873088777', agent_code: 'Profesional_1' },
    ]);
    jest.resetModules();
    const { getBulkWhatsappLine, PASSENGER_OTP_AGENT_CODE } = require('../../src/lib/whatsmeowLines');
    const line = getBulkWhatsappLine();
    expect(line.agentCode).toBe('Profesional_1');
    expect(line.agentCode).not.toBe(PASSENGER_OTP_AGENT_CODE);
    if (previous === undefined) delete process.env.WHATSMEOW_LINES;
    else process.env.WHATSMEOW_LINES = previous;
    jest.resetModules();
  });
});
