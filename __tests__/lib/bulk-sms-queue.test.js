/**
 * @jest-environment node
 */

const { createQueryBuilder } = require('../helpers/supabase-mock');
const { SMS_GATEWAY_BULK_PRIORITY } = require('../../src/lib/smsGateway');
const { BULK_CHANNEL_WHATSAPP } = require('../../src/lib/bulkSms');

function createCampaignClient({
  cooldown = [],
  campaign = {
    id: 'camp-1',
    status: 'queued',
    composed_text: 'Hola\nhttps://www.profesionalviajes.com.ar',
    created_at: '2026-09-15T16:00:00.000Z',
  },
  claimRows = [],
  whatsappClaimRows = [],
} = {}) {
  let claimIndex = 0;
  let waClaimIndex = 0;
  const campaignBuilder = createQueryBuilder({ data: campaign, error: null });
  const queueBuilder = createQueryBuilder({ data: cooldown, error: null });

  return {
    from: jest.fn((table) => {
      if (table === 'sms_campaigns' || table === 'bulk_whatsapp_throttle') {
        return campaignBuilder;
      }
      return queueBuilder;
    }),
    rpc: jest.fn(async (name) => {
      if (name === 'release_stale_sms_outbound') return { data: 0, error: null };
      if (name === 'claim_sms_outbound_message') {
        const row = claimRows[claimIndex];
        claimIndex += 1;
        return { data: row ? [row] : [], error: null };
      }
      if (name === 'claim_whatsapp_bulk_message') {
        const row = whatsappClaimRows[waClaimIndex];
        waClaimIndex += 1;
        return { data: row ? [row] : [], error: null };
      }
      return { data: null, error: null };
    }),
  };
}

describe('hashSmsBody', () => {
  test('cambia si el canal o la imagen de WhatsApp cambian', () => {
    const { hashSmsBody } = require('../../src/lib/bulkSmsQueue');
    const sms = hashSmsBody('Promo de hoy');
    const wa = hashSmsBody('Promo de hoy', { channel: BULK_CHANNEL_WHATSAPP });
    const waImg = hashSmsBody('Promo de hoy', {
      channel: BULK_CHANNEL_WHATSAPP,
      imageUrl: 'https://cdn.example/promo.jpg',
    });
    expect(sms).not.toBe(wa);
    expect(wa).not.toBe(waImg);
    expect(sms).toHaveLength(40);
  });
});

describe('createBulkSmsCampaign', () => {
  test('encola números nuevos y omite el mismo texto en cooldown', async () => {
    const { createBulkSmsCampaign } = require('../../src/lib/bulkSmsQueue');
    const supabase = createCampaignClient({
      cooldown: [{ phone_local: '3878630173' }],
    });

    const result = await createBulkSmsCampaign({
      phones: '3878630173\n3875550100',
      body: 'Hola',
      link: 'https://www.profesionalviajes.com.ar',
      respectQuietHours: false,
      now: new Date('2026-09-15T16:00:00.000Z'),
      wake: false,
    }, { supabase });

    expect(result.ok).toBe(true);
    expect(result.queuedCount).toBe(1);
    expect(result.skippedCount).toBe(1);
    const insertArg = supabase.from.mock.calls
      .map((call, index) => ({ table: call[0], builder: supabase.from.mock.results[index].value }))
      .find((item) => item.table === 'sms_outbound_queue');
    const inserted = insertArg.builder.insert.mock.calls[0][0];
    expect(inserted).toEqual(expect.arrayContaining([
      expect.objectContaining({ phone_local: '3875550100', status: 'queued', channel: 'sms' }),
      expect.objectContaining({ phone_local: '3878630173', status: 'skipped', skip_reason: 'cooldown' }),
    ]));
    expect(inserted.find((row) => row.status === 'queued').body).toContain('https://www.profesionalviajes.com.ar');
  });

  test('rechaza si no queda nadie para enviar', async () => {
    const { createBulkSmsCampaign } = require('../../src/lib/bulkSmsQueue');
    const supabase = createCampaignClient({
      cooldown: [{ phone_local: '3878630173' }],
    });
    const result = await createBulkSmsCampaign({
      phones: '3878630173',
      body: 'Hola',
      respectQuietHours: false,
      now: new Date('2026-09-15T16:00:00.000Z'),
      wake: false,
    }, { supabase });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/24 h/i);
  });

  test('WhatsApp encola canal propio y guarda la imagen para multimedia', async () => {
    const { createBulkSmsCampaign } = require('../../src/lib/bulkSmsQueue');
    const supabase = createCampaignClient({ cooldown: [] });
    const result = await createBulkSmsCampaign({
      phones: '3875550100',
      body: 'Promo',
      imageUrl: 'https://cdn.example/promo.jpg',
      channel: BULK_CHANNEL_WHATSAPP,
      respectQuietHours: false,
      now: new Date('2026-09-15T16:00:00.000Z'),
      wake: false,
    }, { supabase });
    expect(result.ok).toBe(true);
    expect(result.channel).toBe('whatsapp');
    const insertArg = supabase.from.mock.calls
      .map((call, index) => ({ table: call[0], builder: supabase.from.mock.results[index].value }))
      .find((item) => item.table === 'sms_outbound_queue');
    const inserted = insertArg.builder.insert.mock.calls[0][0];
    expect(inserted[0]).toMatchObject({
      channel: 'whatsapp',
      phone_local: '3875550100',
      image_url: 'https://cdn.example/promo.jpg',
      body: 'Promo',
    });
  });
});

describe('processSmsOutboundBatch', () => {
  test('manda con prioridad de masivo y marca sent', async () => {
    const { processSmsOutboundBatch } = require('../../src/lib/bulkSmsQueue');
    const sendImpl = jest.fn(async () => ({ ok: true, messageId: 'msg_bulk', state: 'Pending' }));
    const supabase = createCampaignClient({
      claimRows: [{
        id: 'q-1',
        campaign_id: 'camp-1',
        phone_local: '3875550100',
        body: 'Hola',
        attempts: 1,
        max_attempts: 5,
      }],
    });

    const batch = await processSmsOutboundBatch({
      supabase,
      sendImpl,
      maxMessages: 3,
    });

    expect(sendImpl).toHaveBeenCalledWith({
      phone: '3875550100',
      text: 'Hola',
      priority: SMS_GATEWAY_BULK_PRIORITY,
    });
    expect(batch.sent).toBe(1);
    expect(batch.processed).toBeGreaterThanOrEqual(1);
    expect(supabase.from).toHaveBeenCalledWith('sms_outbound_queue');
  });

  test('si SMSGate falla reencola para reintentar', async () => {
    const { processSmsOutboundBatch } = require('../../src/lib/bulkSmsQueue');
    const sendImpl = jest.fn(async () => ({ ok: false, reason: 'sms_gateway_timeout' }));
    const supabase = createCampaignClient({
      claimRows: [{
        id: 'q-2',
        campaign_id: 'camp-1',
        phone_local: '3875550100',
        body: 'Hola',
        attempts: 1,
        max_attempts: 5,
      }],
    });

    const batch = await processSmsOutboundBatch({ supabase, sendImpl, maxMessages: 1 });
    expect(batch.sent).toBe(0);
    expect(batch.results[0]).toMatchObject({
      claimed: true,
      sent: false,
      error: 'sms_gateway_timeout',
      permanentFailure: false,
    });
  });
});

describe('processWhatsappBulkBatch', () => {
  test('envía imagen multimedia con pie de foto, sin pasar por la cola de viajes', async () => {
    const { processWhatsappBulkBatch } = require('../../src/lib/bulkSmsQueue');
    const sendTextImpl = jest.fn();
    const sendImageImpl = jest.fn(async () => ({ success: true, messageId: 'wa_img_1' }));
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'image/jpeg' },
      arrayBuffer: async () => Uint8Array.from([1, 2, 3, 4]).buffer,
    }));
    const supabase = createCampaignClient({
      whatsappClaimRows: [{
        id: 'wa-1',
        campaign_id: 'camp-wa',
        phone_local: '3875550100',
        body: 'Promo de hoy',
        image_url: 'https://cdn.example/promo.jpg',
        attempts: 1,
        max_attempts: 5,
      }],
    });

    const batch = await processWhatsappBulkBatch({
      supabase,
      sendTextImpl,
      sendImageImpl,
      fetchImpl,
      line: { agentCode: 'Profesional_1', apiKey: 'key' },
      maxMessages: 1,
    });

    expect(sendTextImpl).not.toHaveBeenCalled();
    expect(sendImageImpl).toHaveBeenCalledWith(
      'Profesional_1',
      '5493875550100',
      expect.objectContaining({
        caption: 'Promo de hoy',
        imageBase64: expect.any(String),
      }),
      { apiKey: 'key' },
    );
    expect(batch.sent).toBe(1);
  });

  test('pausa 45 min si WhatsApp responde bloqueo', async () => {
    const { processWhatsappBulkBatch } = require('../../src/lib/bulkSmsQueue');
    const sendTextImpl = jest.fn(async () => ({ success: false, error: 'temporarily banned' }));
    const supabase = createCampaignClient({
      whatsappClaimRows: [{
        id: 'wa-2',
        campaign_id: 'camp-wa',
        phone_local: '3875550100',
        body: 'Hola',
        attempts: 1,
        max_attempts: 5,
      }],
    });

    const batch = await processWhatsappBulkBatch({
      supabase,
      sendTextImpl,
      sendImageImpl: jest.fn(),
      line: { agentCode: 'Profesional_1', apiKey: 'key' },
      maxMessages: 2,
    });

    expect(batch.sent).toBe(0);
    expect(batch.results[0].pausedMs).toBeGreaterThan(30_000);
    expect(supabase.rpc.mock.calls.filter((call) => call[0] === 'claim_whatsapp_bulk_message')).toHaveLength(1);
  });
});
