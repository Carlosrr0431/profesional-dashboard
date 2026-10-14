const {
  buildScheduledTripConfirmationReply,
  buildOpenTripCancelConfirmMessage,
  buildAcceptedTripTrackingMessage,
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

  it('no avisa cola ni pedido tomado antes de que acepten', () => {
    expect(buildOpenTripFastStatusMessage({ status: 'queued' })).toBe('');
    expect(buildOpenTripFastStatusMessage({ status: 'pending', destination_address: 'Mitre 200' })).toBe('');
  });

  it('al aceptar manda el link de seguimiento del viaje', () => {
    const msg = buildAcceptedTripTrackingMessage({
      id: '11111111-1111-4111-8111-111111111111',
      tracking_token: '22222222-2222-4222-8222-222222222222',
      status: 'accepted',
      destination_address: 'Mitre 200',
      destination_lat: -24.78,
      destination_lng: -65.42,
    }, 'https://www.profesionalviajes.com.ar');
    expect(msg).toContain('https://www.profesionalviajes.com.ar/seguimiento/22222222-2222-4222-8222-222222222222');
    expect(msg).toContain('Mitre 200');
    expect(msg).not.toMatch(/ya te mando el móvil/i);
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
