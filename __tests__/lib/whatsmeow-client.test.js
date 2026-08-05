/**
 * Tests del cliente whatsmeow alineado con check-number / @lid.
 */
const {
  normalizeWhatsmeowPhone,
  resolveWhatsmeowJid,
  sendWhatsmeowText,
  sendWhatsmeowPoll,
} = require('../../src/lib/whatsmeowClient');

describe('normalizeWhatsmeowPhone', () => {
  test('antepone 549 a números locales AR', () => {
    expect(normalizeWhatsmeowPhone('3878630173')).toBe('5493878630173');
  });

  test('agrega 9 móvil a 54…', () => {
    expect(normalizeWhatsmeowPhone('543878630173')).toBe('5493878630173');
  });

  test('no normaliza JIDs @lid ni @s.whatsapp.net', () => {
    expect(normalizeWhatsmeowPhone('123456789012345@lid')).toBe('');
    expect(normalizeWhatsmeowPhone('5493878630173@s.whatsapp.net')).toBe('');
  });

  test('rechaza user-ids largos sin 54', () => {
    expect(normalizeWhatsmeowPhone('123456789012345')).toBe('');
  });
});

describe('resolveWhatsmeowJid + send', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  test('resolveWhatsmeowJid usa check-number', async () => {
    const calls = [];
    global.fetch = jest.fn(async (url) => {
      calls.push(String(url));
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          success: true,
          data: { jid: '5493878630173@s.whatsapp.net', registered: true },
        }),
        json: async () => ({
          success: true,
          data: { jid: '5493878630173@s.whatsapp.net', registered: true },
        }),
      };
    });

    const jid = await resolveWhatsmeowJid('Test_Agent', '3878630173', { apiKey: 'k' });
    expect(jid).toBe('5493878630173@s.whatsapp.net');
    expect(calls[0]).toContain('/api/check-number');
    expect(calls[0]).toContain('phone=5493878630173');
  });

  test('sendWhatsmeowText no envía si no está registrado', async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        success: true,
        data: { registered: false },
      }),
      json: async () => ({ success: true, data: { registered: false } }),
    }));

    const result = await sendWhatsmeowText('Test_Agent', '3878630173', 'hola', { apiKey: 'k' });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not registered/i);
  });

  test('sendWhatsmeowPoll resuelve JID y envía number en dígitos', async () => {
    const bodies = [];
    global.fetch = jest.fn(async (url, opts = {}) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/check-number')) {
        return {
          ok: true,
          status: 200,
          text: async () => JSON.stringify({
            success: true,
            data: { jid: '5493878630173@s.whatsapp.net', registered: true },
          }),
          json: async () => ({
            success: true,
            data: { jid: '5493878630173@s.whatsapp.net', registered: true },
          }),
        };
      }
      bodies.push(JSON.parse(opts.body || '{}'));
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true, data: { message_id: 'POLL1' } }),
        json: async () => ({ success: true, data: { message_id: 'POLL1' } }),
      };
    });

    const result = await sendWhatsmeowPoll(
      'Test_Agent',
      '3878630173',
      { name: '¿Confirmás?', options: ['Sí', 'No'] },
      { apiKey: 'k' }
    );
    expect(result.success).toBe(true);
    expect(result.messageId).toBe('POLL1');
    expect(bodies[0].number).toBe('5493878630173');
    expect(bodies[0].options).toEqual(['Sí', 'No']);
  });

  test('sendWhatsmeowText con @lid manda el JID sin normalizar a dígitos', async () => {
    const bodies = [];
    global.fetch = jest.fn(async (url, opts = {}) => {
      if (String(url).includes('/api/check-number')) {
        throw new Error('no debería llamar check-number para JID');
      }
      bodies.push(JSON.parse(opts.body || '{}'));
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ success: true, data: { message_id: 'OUT1' } }),
        json: async () => ({ success: true, data: { message_id: 'OUT1' } }),
      };
    });

    const result = await sendWhatsmeowText(
      'Test_Agent',
      '123456789012345@lid',
      'hola',
      { apiKey: 'k' }
    );
    expect(result.success).toBe(true);
    expect(bodies[0].phone).toBe('123456789012345@lid');
  });
});
