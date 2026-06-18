const {
  buildScheduledTripConfirmationReply,
  buildOpenTripCancelConfirmMessage,
  buildOpenTripFastStatusMessage,
  buildOpenTripCancelDeniedMessage,
  buildOpenTripCancelSuccessMessage,
  buildScheduledStatusQueryReply,
} = require('../../src/lib/scheduledTripWhatsAppMessages');

describe('scheduledTripWhatsAppMessages', () => {
  const scheduledTrip = {
    status: 'scheduled',
    notes: [
      '[SCHEDULED_FOR] 2026-05-25T14:42:00.000Z',
      '[SCHEDULED_DISPLAY] lunes 25/05 a las 11:42',
    ].join('\n'),
    destination_address: 'Mitre 200',
  };

  it('confirmación de reserva menciona cancelar y sí', () => {
    const msg = buildScheduledTripConfirmationReply({
      displayText: 'lunes 25/05 a las 11:42',
      pickupAddress: 'Mitre 200',
    });
    expect(msg).toContain('lunes 25/05 a las 11:42');
    expect(msg).toContain('*cancelar*');
    expect(msg).toContain('*sí*');
  });

  it('fast path scheduled no dice móvil asignado', () => {
    const msg = buildOpenTripFastStatusMessage(scheduledTrip);
    expect(msg).toContain('reserva agendada');
    expect(msg).toContain('lunes 25/05 a las 11:42');
    expect(msg).not.toMatch(/móvil asignado/i);
  });

  it('cancelar reserva pide confirmación con fecha', () => {
    const msg = buildOpenTripCancelConfirmMessage(scheduledTrip);
    expect(msg).toContain('reserva del *lunes 25/05 a las 11:42*');
  });

  it('rechazo de cancelación mantiene reserva', () => {
    expect(buildOpenTripCancelDeniedMessage(scheduledTrip)).toContain('sigue agendada');
  });

  it('cancelación exitosa distingue reserva', () => {
    expect(buildOpenTripCancelSuccessMessage(scheduledTrip)).toContain('cancelé tu reserva');
    expect(buildOpenTripCancelSuccessMessage({ status: 'pending' })).toContain('cancelé el pedido');
  });

  it('status query scheduled', () => {
    expect(buildScheduledStatusQueryReply(scheduledTrip, null)).toContain('lunes 25/05 a las 11:42');
  });
});
