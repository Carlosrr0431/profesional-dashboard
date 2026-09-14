const {
  SMS_GATEWAY_CLOUD_BASE,
  SMS_GATEWAY_DEVICE_ACTIVE_WITHIN_HOURS,
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
  test('arma E.164 AR con 9 móvil', () => {
    expect(toSmsE164('3878630173')).toBe('+5493878630173');
    expect(toSmsE164('543878630173')).toBe('+5493878630173');
    expect(toSmsE164('+54 9 387 863-0173')).toBe('+5493878630173');
    expect(toSmsE164('')).toBe('');
  });

  test('el SMS del OTP incluye el código y cabe en un segmento', () => {
    const text = buildPassengerSmsOtpMessage('2580');
    expect(text).toContain('2580');
    expect(text).toMatch(/codigo/i);
    expect(text.length).toBeLessThanOrEqual(160);
  });

  test('arma Basic y Bearer', () => {
    expect(buildSmsGatewayAuthHeader({ username: 'u', password: 'p' }))
      .toBe(`Basic ${Buffer.from('u:p').toString('base64')}`);
    expect(buildSmsGatewayAuthHeader({ token: 'abc' })).toBe('Bearer abc');
  });

  test('el payload usa textMessage y el destino E.164', () => {
    expect(buildSmsGatewayPayload({
      phoneE164: '+5493878630173',
      text: 'hola',
      config: { deviceId: 'dev_1', simNumber: 1 },
    })).toEqual({
      textMessage: { text: 'hola' },
      phoneNumbers: ['+5493878630173'],
      ttl: 600,
      priority: 100,
      withDeliveryReport: true,
      deviceId: 'dev_1',
      simNumber: 1,
    });
  });
});

describe('sendSmsGatewayMessage', () => {
  const env = { SMS_GATEWAY_USERNAME: 'otp', SMS_GATEWAY_PASSWORD: 'secret' };

  test('POST 202 Pending y luego Sent cuenta como enviado', async () => {
    const fetchImpl = jest.fn(async (url, init) => {
      if (init.method === 'POST') {
        expect(url).toBe(`${SMS_GATEWAY_CLOUD_BASE}/messages?deviceActiveWithin=${SMS_GATEWAY_DEVICE_ACTIVE_WITHIN_HOURS}`);
        expect(SMS_GATEWAY_DEVICE_ACTIVE_WITHIN_HOURS).toBe(1);
        expect(init.headers.Authorization).toMatch(/^Basic /);
        const body = JSON.parse(init.body);
        expect(body.phoneNumbers).toEqual(['+5493878630173']);
        expect(body.textMessage.text).toContain('1234');
        return {
          status: 202,
          json: async () => ({ id: 'msg_1', state: 'Pending' }),
        };
      }
      expect(url).toBe(`${SMS_GATEWAY_CLOUD_BASE}/messages/msg_1`);
      return {
        status: 200,
        json: async () => ({ id: 'msg_1', state: 'Sent' }),
      };
    });

    const result = await sendSmsGatewayMessage({
      phone: '3878630173',
      text: buildPassengerSmsOtpMessage('1234'),
      env,
      fetchImpl,
      waitSentMs: 50,
      pollMs: 10,
    });

    expect(result).toEqual({ ok: true, messageId: 'msg_1', state: 'Sent' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test('si el celular no procesa el SMS no se toma como enviado', async () => {
    const fetchImpl = jest.fn(async (_url, init) => {
      if (init.method === 'POST') {
        return {
          status: 202,
          json: async () => ({ id: 'msg_stuck', state: 'Pending' }),
        };
      }
      return {
        status: 200,
        json: async () => ({ id: 'msg_stuck', state: 'Pending' }),
      };
    });

    const result = await sendSmsGatewayMessage({
      phone: '3878630173',
      text: 'x',
      env,
      fetchImpl,
      waitSentMs: 0,
      pollMs: 10,
    });

    expect(result).toEqual({
      ok: false,
      reason: 'sms_gateway_still_pending',
      messageId: 'msg_stuck',
      state: 'Pending',
    });
    expect(fetchImpl.mock.calls.some((call) => call[1]?.method === 'DELETE')).toBe(true);
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
      fetchImpl: async () => {
        throw err;
      },
    });
    expect(result).toEqual({ ok: false, reason: 'sms_gateway_timeout' });
  });
});
