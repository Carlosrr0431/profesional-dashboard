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
});
