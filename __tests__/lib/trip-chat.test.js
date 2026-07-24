const {
  phonesMatchTrip,
  sanitizeChatText,
  isTripChatWritable,
  isTripChatReadable,
} = require('../../src/lib/tripChat');
const {
  buildTripChatPushPreview,
  buildTripChatPushContent,
} = require('../../src/lib/tripChatPush');

describe('tripChat', () => {
  it('phonesMatchTrip acepta variantes AR', () => {
    expect(phonesMatchTrip('5493878630173', '3878630173')).toBe(true);
    expect(phonesMatchTrip('543878630173', '5493878630173')).toBe(true);
    expect(phonesMatchTrip('+54 9 387 863-0173', '543878630173')).toBe(true);
    expect(phonesMatchTrip('5493878630173', '5491111111111')).toBe(false);
  });

  it('sanitizeChatText limpia y corta', () => {
    expect(sanitizeChatText('  hola   mundo  ')).toBe('hola mundo');
    expect(sanitizeChatText('')).toBeNull();
    expect(sanitizeChatText('a'.repeat(600)).length).toBe(500);
  });

  it('estados de chat', () => {
    expect(isTripChatWritable('accepted')).toBe(true);
    expect(isTripChatWritable('going_to_pickup')).toBe(true);
    expect(isTripChatWritable('in_progress')).toBe(true);
    expect(isTripChatWritable('queued')).toBe(false);
    expect(isTripChatReadable('completed')).toBe(true);
    expect(isTripChatReadable('cancelled')).toBe(false);
  });

  it('buildTripChatPushPreview resume texto y audio', () => {
    expect(buildTripChatPushPreview({ messageType: 'audio' })).toBe('🎤 Audio');
    expect(buildTripChatPushPreview({ messageType: 'text', body: 'Hola' })).toBe('Hola');
    expect(buildTripChatPushPreview({ messageType: 'text', body: 'a'.repeat(100) }).endsWith('…')).toBe(true);
  });

  it('buildTripChatPushContent usa títulos en español', () => {
    expect(buildTripChatPushContent({ senderRole: 'driver', messageType: 'text', body: 'Voy' })).toEqual({
      title: 'Mensaje del conductor',
      body: 'Voy',
      channelId: 'viajes',
    });
    expect(buildTripChatPushContent({ senderRole: 'passenger', messageType: 'audio' })).toEqual({
      title: 'Mensaje del pasajero',
      body: '🎤 Audio',
      channelId: 'messages',
    });
  });
});
