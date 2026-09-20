const {
  SMS_GATEWAY_CLOUD_BASE,
  SMS_GATEWAY_DEVICE_ACTIVE_WITHIN_HOURS,
  SMS_GATEWAY_OTP_PRIORITY,
  SMS_GATEWAY_BULK_PRIORITY,
  getSmsGatewayConfig,
  isSmsGatewayConfigured,
  resolveOtpDeliveryChannel,
  toSmsE164,
  buildPassengerSmsOtpMessage,
  buildSmsGatewayAuthHeader,
  buildSmsGatewayPayload,
  sendSmsGatewayMessage,
} = require('../../src/lib/smsGateway');

describe('sms gateway config', () => {
  test('sin credenciales no está configurado, pero el canal sigue siendo SMS', () => {
    const env = {};
    expect(getSmsGatewayConfig(env)).toBeNull();
    expect(isSmsGatewayConfigured(env)).toBe(false);
    expect(resolveOtpDeliveryChannel(env)).toBe('sms');
  });

  test('con usuario y clave usa la cloud de SMSGate', () => {
    const env = {
      SMS_GATEWAY_USERNAME: 'otp',
      SMS_GATEWAY_PASSWORD: 'secret',
    };
    expect(isSmsGatewayConfigured(env)).toBe(true);
    expect(resolveOtpDeliveryChannel(env)).toBe('sms');
    expect(getSmsGatewayConfig(env)).toMatchObject({
      baseUrl: SMS_GATEWAY_CLOUD_BASE,
      username: 'otp',
      password: 'secret',
      token: '',
      deviceId: null,
      simNumber: null,
    });
  });

  test('acepta token Bearer y SIM / device opcionales', () => {
    const env = {
      SMS_GATEWAY_TOKEN: 'tok_abc',
      SMS_GATEWAY_URL: 'https://sms.interno.ar/api/3rdparty/v1/',
      SMS_GATEWAY_DEVICE_ID: 'dev_1',
      SMS_GATEWAY_SIM_NUMBER: '2',
    };
    expect(getSmsGatewayConfig(env)).toEqual({
      baseUrl: 'https://sms.interno.ar/api/3rdparty/v1',
      username: '',
      password: '',
      token: 'tok_abc',
      deviceId: 'dev_1',
      simNumber: 2,
    });
  });
});

describe('sms helpers', () => {
  test('usa 10 dígitos locales, sin el 9 de WhatsApp', () => {
    expect(toSmsE164('3878630173')).toBe('3878630173');
    expect(toSmsE164('543878630173')).toBe('3878630173');
    expect(toSmsE164('+54 9 387 863-0173')).toBe('3878630173');
    expect(toSmsE164('')).toBe('');
  });

  test('el SMS del OTP incluye el código, cabe en un segmento y no parece plantilla de verificación', () => {
    const texts = new Set();
    for (let i = 0; i < 20; i += 1) {
      const text = buildPassengerSmsOtpMessage('2580');
      texts.add(text);
      expect(text).toContain('2580');
      expect(text.length).toBeLessThanOrEqual(160);
      expect(text).toMatch(/^[A-Za-z0-9 ,.-]+$/);
      expect(text.toLowerCase()).not.toMatch(/codigo|otp|verificacion|no lo compartas|valido/);
    }
    expect(texts.size).toBeGreaterThan(1);
  });

  test('arma Basic y Bearer', () => {
    expect(buildSmsGatewayAuthHeader({ username: 'u', password: 'p' }))
      .toBe(`Basic ${Buffer.from('u:p').toString('base64')}`);
    expect(buildSmsGatewayAuthHeader({ token: 'abc' })).toBe('Bearer abc');
  });

  test('el payload usa textMessage y el destino E.164', () => {
    expect(buildSmsGatewayPayload({
      phoneE164: '3878630173',
      text: 'hola',
      config: { deviceId: 'dev_1', simNumber: 1 },
    })).toEqual({
      textMessage: { text: 'hola' },
      phoneNumbers: ['3878630173'],
      ttl: 600,
      priority: 100,
      withDeliveryReport: false,
      deviceId: 'dev_1',
      simNumber: 1,
    });
  });

  test('el masivo baja la prioridad y no adjunta MMS', () => {
    expect(SMS_GATEWAY_BULK_PRIORITY).toBeLessThan(SMS_GATEWAY_OTP_PRIORITY);
    const payload = buildSmsGatewayPayload({
      phoneE164: '3878630173',
      text: 'Promo\nhttps://ejemplo.test/foto.jpg',
      priority: SMS_GATEWAY_BULK_PRIORITY,
    });
    expect(payload.priority).toBe(0);
    expect(payload.ttl).toBe(3600);
    expect(payload.withDeliveryReport).toBe(true);
    expect(payload.textMessage).toEqual({ text: 'Promo\nhttps://ejemplo.test/foto.jpg' });
    expect(payload).not.toHaveProperty('dataMessage');
    expect(payload).not.toHaveProperty('mms');
    expect(payload).not.toHaveProperty('media');
  });
});

describe('sendSmsGatewayMessage', () => {
  const env = { SMS_GATEWAY_USERNAME: 'otp', SMS_GATEWAY_PASSWORD: 'secret' };

  test('POST 202 Pending se toma como encolado, sin cancelar', async () => {
    const fetchImpl = jest.fn(async (url, init) => {
      expect(url).toBe(`${SMS_GATEWAY_CLOUD_BASE}/messages?deviceActiveWithin=${SMS_GATEWAY_DEVICE_ACTIVE_WITHIN_HOURS}&skipPhoneValidation=true`);
      expect(SMS_GATEWAY_DEVICE_ACTIVE_WITHIN_HOURS).toBe(1);
      expect(init.method).toBe('POST');
      expect(init.headers.Authorization).toMatch(/^Basic /);
      const body = JSON.parse(init.body);
      expect(body.phoneNumbers).toEqual(['3878630173']);
      expect(body.textMessage.text).toContain('1234');
      return {
        status: 202,
        json: async () => ({ id: 'msg_1', state: 'Pending' }),
      };
    });

    const result = await sendSmsGatewayMessage({
      phone: '3878630173',
      text: buildPassengerSmsOtpMessage('1234'),
      env,
      fetchImpl,
    });

    expect(result).toEqual({ ok: true, messageId: 'msg_1', state: 'Pending' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('HTTP 401 no se toma como enviado', async () => {
    const result = await sendSmsGatewayMessage({
      phone: '3878630173',
      text: 'x',
      env: { SMS_GATEWAY_USERNAME: 'otp', SMS_GATEWAY_PASSWORD: 'bad' },
      fetchImpl: async () => ({
        status: 401,
        json: async () => ({ message: 'unauthorized' }),
      }),
    });
    expect(result.ok).toBe(false);
    expect(result.reason).toBe('unauthorized');
    expect(result.status).toBe(401);
  });

  test('un abort del fetch se informa como timeout, no como enviado', async () => {
    const err = new Error('The operation was aborted.');
    err.name = 'AbortError';
    const result = await sendSmsGatewayMessage({
      phone: '3878630173',
      text: 'x',
      env,
      retries: 0,
      fetchImpl: async () => {
        throw err;
      },
    });
    expect(result).toEqual({ ok: false, reason: 'sms_gateway_timeout' });
  });

  test('un timeout de OTP reintenta una vez el mismo mensaje', async () => {
    const err = new Error('The operation was aborted.');
    err.name = 'AbortError';
    const fetchImpl = jest.fn()
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce({
        status: 202,
        json: async () => ({ id: 'msg_retry', state: 'Pending' }),
      });

    const result = await sendSmsGatewayMessage({
      phone: '3878630173',
      text: 'x',
      env,
      fetchImpl,
    });

    expect(result).toEqual({ ok: true, messageId: 'msg_retry', state: 'Pending' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test('un 401 no se reintenta', async () => {
    const fetchImpl = jest.fn(async () => ({
      status: 401,
      json: async () => ({ message: 'unauthorized' }),
    }));
    const result = await sendSmsGatewayMessage({
      phone: '3878630173',
      text: 'x',
      env,
      fetchImpl,
    });
    expect(result.ok).toBe(false);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
