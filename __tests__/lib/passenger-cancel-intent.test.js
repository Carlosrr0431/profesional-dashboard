const {
  normalizePassengerMessage,
  isCancelarLikeToken,
  isStandaloneCancelMessage,
  messageRequestsTripCancel,
  messageConfirmsTripCancel,
  messageDeniesTripCancel,
  isCancelConfirmationPollYesVote,
  isCancelConfirmationPollNoVote,
  isCancelConfirmationPollVote,
  CANCEL_CONFIRM_POLL_QUESTION,
  CANCEL_CONFIRM_OPTION_YES,
  CANCEL_CONFIRM_OPTION_NO,
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

    it('no confunde pedido de móvil con cancelación', () => {
      expect(messageRequestsTripCancel('hola, me mandas a mitre al 360')).toBe(false);
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
      expect(isCancelConfirmationPollYesVote(CANCEL_CONFIRM_OPTION_YES)).toBe(true);
      expect(isCancelConfirmationPollNoVote('Sí, cancelar')).toBe(false);
    });

    it('voto No, mantener el viaje', () => {
      expect(isCancelConfirmationPollNoVote('No, mantener el viaje')).toBe(true);
      expect(isCancelConfirmationPollNoVote(CANCEL_CONFIRM_OPTION_NO)).toBe(true);
      expect(isCancelConfirmationPollYesVote('No, mantener el viaje')).toBe(false);
    });

    it('no trata "cancelar" suelto como voto de encuesta', () => {
      expect(isCancelConfirmationPollYesVote('cancelar')).toBe(false);
      expect(isCancelConfirmationPollVote('cancelar')).toBe(false);
    });

    it('no confunde el voto de precio "No, cancelar el viaje"', () => {
      expect(isCancelConfirmationPollYesVote('No, cancelar el viaje')).toBe(false);
      expect(isCancelConfirmationPollNoVote('No, cancelar el viaje')).toBe(false);
    });

    it('pregunta de encuesta es la esperada', () => {
      expect(CANCEL_CONFIRM_POLL_QUESTION).toBe('¿Confirmás la cancelación de tu viaje?');
    });
  });
});
