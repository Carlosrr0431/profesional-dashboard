const { buildWhatsAppCancelledTripUpdate, WHATSAPP_CANCEL_REASON } = require('../../src/lib/passengerTripCancel');
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
  lastBotAlreadyConfirmedCancel,
  wasRecentlyCancelled,
  resolveOpenTripCancelAction,
  shouldIgnoreCancelWithoutOpenTrip,
  stampCancelledConversationContext,
  CANCEL_CONFIRM_POLL_QUESTION,
  CANCEL_CONFIRM_OPTION_YES,
  CANCEL_CONFIRM_OPTION_NO,
  RECENT_CANCEL_WINDOW_MS,
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

  describe('shouldIgnoreCancelWithoutOpenTrip', () => {
    it('silencia el voto Sí, cancelar si el viaje ya no está abierto', () => {
      expect(shouldIgnoreCancelWithoutOpenTrip({
        text: 'Sí, cancelar',
        context: {},
        lastBotReply: null,
      })).toBe(true);
      expect(messageRequestsTripCancel('Sí, cancelar')).toBe(true);
    });

    it('silencia si el bot ya confirmó la cancelación', () => {
      expect(lastBotAlreadyConfirmedCancel(
        'Listo, cancelé el pedido. Avisame cuando necesites otro móvil.'
      )).toBe(true);
      expect(shouldIgnoreCancelWithoutOpenTrip({
        text: 'cancelar',
        context: {},
        lastBotReply: 'Listo, cancelé el pedido. Avisame cuando necesites otro móvil.',
      })).toBe(true);
    });

    it('silencia un cancelar fresco solo si acabamos de anular', () => {
      const now = Date.parse('2026-09-04T00:31:43.000Z');
      const context = stampCancelledConversationContext(
        {},
        new Date('2026-09-04T00:31:30.000Z'),
      );
      expect(wasRecentlyCancelled(context, now)).toBe(true);
      expect(shouldIgnoreCancelWithoutOpenTrip({
        text: 'cancelar',
        context,
        lastBotReply: null,
        now,
      })).toBe(true);
      expect(wasRecentlyCancelled(context, now + RECENT_CANCEL_WINDOW_MS + 1)).toBe(false);
    });

    it('simula pedidos reales de cancelar y el cierre del viaje', () => {
      const wantCancel = [
        'cancelar',
        'Cancelá',
        'cancela',
        'cancelame el viaje',
        'quiero cancelar el viaje',
        'canselar',
        'ya no lo quiero',
        'ya no lo necesito',
        'no quiero el remis',
        'anular el pedido',
        'anula el viaje',
        'sacame el viaje',
        'olvidalo',
        'pará el remis',
        'no me mandes el auto',
        'que no venga',
        'no vengas',
        'me arrepentí',
        'borra el viaje',
        'borralo',
        'elimina el pedido',
        'che cancelá',
        'dale cancelá',
      ];
      const notCancel = [
        'hola',
        'Mitre 200',
        'mandame un movil a mitre 200',
        'donde esta el chofer',
        'cuanto sale de mitre a españa',
        'cuanto sale cancelar un viaje',
        'no cancelar',
        'gracias',
        'para mañana a las 8',
        'necesito un remis para el hospital',
      ];

      for (const text of wantCancel) {
        expect({ text, action: resolveOpenTripCancelAction(text) }).toEqual({ text, action: 'ask_confirm' });
      }
      for (const text of notCancel) {
        expect({ text, action: resolveOpenTripCancelAction(text) }).toEqual({ text, action: 'not_cancel' });
      }

      const confirmations = ['sí', 'si', 'SÍ', 'dale', 'ok', 'confirmo', 'cancelar', 'Sí, cancelar', 'si, cancelar'];
      for (const text of confirmations) {
        expect(resolveOpenTripCancelAction(text, { pendingCancelConfirm: true })).toBe('confirm_cancel');
      }
      for (const text of ['no', 'no cancelar', 'No, mantener el viaje', 'dejalo asi']) {
        expect(resolveOpenTripCancelAction(text, { pendingCancelConfirm: true })).toBe('deny_cancel');
      }
      expect(resolveOpenTripCancelAction('a qué hora llega', { pendingCancelConfirm: true })).toBe('unclear_confirm');

      const openTrip = { status: 'queued', driver_id: null, id: 'trip-sim' };
      expect(resolveOpenTripCancelAction('cancelar')).toBe('ask_confirm');
      expect(openTrip.status).toBe('queued');

      for (const status of ['queued', 'pending', 'accepted', 'going_to_pickup', 'in_progress', 'scheduled']) {
        const payload = buildWhatsAppCancelledTripUpdate({
          status,
          driver_id: status === 'queued' ? null : 'driver-1',
        });
        expect(payload.status).toBe('cancelled');
        expect(payload.dispatch_status).toBe('cancelled');
        expect(payload.cancel_reason).toBe(WHATSAPP_CANCEL_REASON);
        expect(payload.wa_context).toBeNull();
        expect(payload.next_dispatch_at).toBeNull();
      }
    });

    it('no silencia un cancelar suelto sin viaje ni contexto reciente', () => {
      expect(shouldIgnoreCancelWithoutOpenTrip({
        text: 'cancelar',
        context: {},
        lastBotReply: null,
      })).toBe(false);
    });
  });
});
