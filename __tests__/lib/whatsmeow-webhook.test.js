const { normalizeWhatsmeowWebhookBody } = require('../../src/lib/whatsmeowWebhook');

describe('normalizeWhatsmeowWebhookBody', () => {
  test('convierte text upsert al formato Wasender-like', () => {
    const out = normalizeWhatsmeowWebhookBody({
      event: 'messages.upsert',
      agent_code: 'Agente_1',
      data: {
        id: 'MSG1',
        body: 'Hola',
        type: 'text',
        is_from_me: false,
        sender_pn: '5493878630173',
        chat_jid: '5493878630173@s.whatsapp.net',
        push_name: 'Juan',
      },
    });

    expect(out.event).toBe('messages.upsert');
    expect(out.data.messages.key.id).toBe('MSG1');
    expect(out.data.messages.key.remoteJid).toBe('5493878630173@s.whatsapp.net');
    expect(out.data.messages.message.conversation).toBe('Hola');
    expect(out.data.messages.pushName).toBe('Juan');
  });

  test('convierte voto poll a poll.results', () => {
    const out = normalizeWhatsmeowWebhookBody({
      event: 'messages.poll',
      agent_code: 'Agente_1',
      data: {
        id: 'VOTE1',
        body: '1',
        type: 'button_reply',
        button_id: 'opt_1',
        poll_id: 'POLL123',
        poll_option: 'Sí, confirmar el viaje',
        sender_pn: '5493878630173',
        is_from_me: false,
      },
    });

    expect(out.event).toBe('poll.results');
    expect(out.data.key.id).toBe('POLL123');
    expect(out.data.pollResult[0].name).toBe('Sí, confirmar el viaje');
    expect(out.data.pollResult[0].voters[0]).toContain('5493878630173');
    expect(out.data.pollResult[0].button_id).toBe('opt_1');
  });

  test('voto poll sin poll_option usa button_id opt_N', () => {
    const out = normalizeWhatsmeowWebhookBody({
      event: 'messages.poll',
      agent_code: 'Agente_1',
      data: {
        id: 'VOTE2',
        body: '',
        type: 'poll_vote',
        button_id: 'opt_2',
        poll_id: 'POLL456',
        sender_pn: '5493878630173',
        is_from_me: false,
      },
    });

    expect(out.event).toBe('poll.results');
    expect(out.data.pollResult[0].name).toBe('opt_2');
    expect(out.data.pollResult[0].button_id).toBe('opt_2');
  });

  test('no toma teléfono de chat_jid @lid', () => {
    const out = normalizeWhatsmeowWebhookBody({
      event: 'messages.upsert',
      agent_code: 'Agente_1',
      data: {
        id: 'MSG_LID',
        body: 'Hola',
        type: 'text',
        is_from_me: false,
        chat_jid: '123456789012345@lid',
        push_name: 'Juan',
      },
    });

    expect(out.data.messages.key.cleanedSenderPn).toBeUndefined();
    expect(out.data.messages.key.remoteJid).toBe('123456789012345@lid');
  });

  test('deja pasar payloads Wasender sin tocar', () => {
    const body = {
      event: 'messages.upsert',
      data: {
        messages: {
          key: { id: 'X', remoteJid: '549111@s.whatsapp.net', fromMe: false },
          message: { conversation: 'hola' },
        },
      },
    };
    const out = normalizeWhatsmeowWebhookBody(body);
    expect(out).toEqual(body);
  });

  test('parsea ubicación desde latitude/longitude o body', () => {
    const out = normalizeWhatsmeowWebhookBody({
      event: 'messages.upsert',
      agent_code: 'Agente_1',
      data: {
        id: 'LOC1',
        type: 'location',
        body: '📍 -24.789012, -65.412345',
        latitude: -24.789012,
        longitude: -65.412345,
        address: 'Plaza 9 de Julio',
        sender_pn: '5493878630173',
        is_from_me: false,
      },
    });
    const loc = out.data.messages.message.locationMessage;
    expect(loc.degreesLatitude).toBeCloseTo(-24.789012);
    expect(loc.degreesLongitude).toBeCloseTo(-65.412345);
    expect(loc.address).toBe('Plaza 9 de Julio');
  });
});
