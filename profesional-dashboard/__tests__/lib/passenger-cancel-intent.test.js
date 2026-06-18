const {
  normalizePassengerMessage,
  isCancelarLikeToken,
  isStandaloneCancelMessage,
  messageRequestsTripCancel,
  messageConfirmsTripCancel,
  messageDeniesTripCancel,
  isCancelConfirmationPollYesVote,
} = require('../../src/lib/passengerCancelIntent');

describe('passengerCancelIntent', () => {
  describe('normalizePassengerMessage', () => {
    it('unifica mayúsculas y tildes', () => {
      expect(normalizePassengerMessage('CANCELÁ')).toBe('cancela');
      expect(normalizePassengerMessage('  Cancelar  ')).toBe('cancelar');
    });
  });

  describe('isCancelarLikeToken', () => {
    it.each([
      'cancelar',
      'CANCELAR',
      'cancela',
      'cancelá',
      'cancellar',
      'cancear',
      'canselar',
      'cancelalo',
      'cancelame',
    ])('acepta %s', (word) => {
      expect(isCancelarLikeToken(word)).toBe(true);
    });
  });

  describe('messageRequestsTripCancel', () => {
    it.each([
      'cancelar',
      'Cancelar',
      'CANCELAR',
      '"cancelar"',
      '«cancelar»',
      'cancelá',
      'cancela',
      'cancellar',
      'canselar',
      'quiero cancelar',
      'cancelar el viaje',
      'cancelar por favor',
      'ya no lo quiero',
      'no quiero el remis',
      'anular el pedido',
    ])('detecta pedido: %s', (msg) => {
      expect(messageRequestsTripCancel(msg)).toBe(true);
    });

    it('no confunde con consulta de precio', () => {
      expect(messageRequestsTripCancel('cuanto sale cancelar un viaje')).toBe(false);
    });

    it('respeta no cancelar', () => {
      expect(messageRequestsTripCancel('no cancelar')).toBe(false);
    });
  });

  describe('messageConfirmsTripCancel', () => {
    it.each(['si', 'SÍ', 'Si', 'sii', 'dale', 'ok', 'confirmo', 'cancelar', 'CANCELAR', 'si cancelar'])( 
      'confirma: %s',
      (msg) => {
        expect(messageConfirmsTripCancel(msg)).toBe(true);
      }
    );

    it.each(['no', 'no cancelar', 'mantener el viaje'])('rechaza: %s', (msg) => {
      expect(messageConfirmsTripCancel(msg)).toBe(false);
    });
  });

  describe('isStandaloneCancelMessage', () => {
    it('mensaje solo con comillas', () => {
      expect(isStandaloneCancelMessage('"cancelar"')).toBe(true);
    });
  });

  describe('poll cancelación', () => {
    it('voto Sí, cancelar', () => {
      expect(isCancelConfirmationPollYesVote('Sí, cancelar')).toBe(true);
    });
  });
});
