/**
 * @jest-environment node
 */

const {
  isWhatsappBanLikeError,
  isWhatsappPermanentSendError,
  isWhatsappTransientDisconnect,
} = require('../../src/lib/whatsappAntiBan');

describe('whatsappAntiBan', () => {
  test('detecta bloqueo / 403', () => {
    expect(isWhatsappBanLikeError('blocked')).toBe(true);
    expect(isWhatsappBanLikeError('HTTP 403 Forbidden')).toBe(true);
    expect(isWhatsappBanLikeError('iq error 403')).toBe(true);
    expect(isWhatsappBanLikeError('rate-limit exceeded')).toBe(true);
  });

  test('no marca errores de negocio como ban', () => {
    expect(isWhatsappBanLikeError('')).toBe(false);
    expect(isWhatsappBanLikeError('timeout_esperando_envio_en_cola')).toBe(false);
    expect(isWhatsappBanLikeError('text vacío')).toBe(false);
  });

  test('número no registrado es permanente y no ban', () => {
    expect(isWhatsappPermanentSendError('number is not registered on WhatsApp')).toBe(true);
    expect(isWhatsappBanLikeError('number is not registered on WhatsApp')).toBe(false);
  });

  test('websocket caído es transitorio', () => {
    expect(isWhatsappTransientDisconnect('websocket not connected')).toBe(true);
    expect(isWhatsappBanLikeError('websocket not connected')).toBe(false);
  });

  test('timeout de cola no es ban', () => {
    const { isWhatsappQueueTimeoutError } = require('../../src/lib/whatsappAntiBan');
    expect(isWhatsappQueueTimeoutError('timeout_esperando_envio_en_cola')).toBe(true);
    expect(isWhatsappBanLikeError('timeout_esperando_envio_en_cola')).toBe(false);
  });

  test('pausa protectora solo con interval largo vigente', () => {
    const { isWhatsappLineProtectivePause } = require('../../src/lib/whatsappAntiBan');
    const now = Date.parse('2026-08-31T20:00:00.000Z');
    expect(isWhatsappLineProtectivePause(null, now)).toEqual({ paused: false, retryAfterSeconds: 0 });
    expect(isWhatsappLineProtectivePause({
      last_sent_at: '2026-08-31T19:59:50.000Z',
      interval_ms: 15_000,
    }, now)).toEqual({ paused: false, retryAfterSeconds: 0 });
    const pause = isWhatsappLineProtectivePause({
      last_sent_at: '2026-08-31T19:50:00.000Z',
      interval_ms: 45 * 60_000,
    }, now);
    expect(pause.paused).toBe(true);
    expect(pause.retryAfterSeconds).toBe(35 * 60);
  });
});
