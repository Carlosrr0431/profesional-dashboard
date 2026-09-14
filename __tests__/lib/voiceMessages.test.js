import { mergeVoiceMessage, mergeVoiceMessages, summarizeIncomingDriverVoice, unreadVoiceCountForDriver } from '../../src/lib/voiceMessages';

describe('summarizeIncomingDriverVoice', () => {
  it('agrupa audios nuevos del chofer para el aviso del mapa', () => {
    const drivers = [
      { id: 'drv-1', fullName: 'Charly Brown', driverNumber: 1 },
      { id: 'drv-2', fullName: 'Roberto', driverNumber: 99 },
    ];
    const incoming = summarizeIncomingDriverVoice([
      {
        id: 'a',
        driver_id: 'drv-1',
        sender_type: 'driver',
        audio_url: 'https://cdn.example/a.m4a',
        is_played: false,
        created_at: '2026-09-14T20:00:00.000Z',
      },
      {
        id: 'b',
        driver_id: 'drv-1',
        sender_type: 'driver',
        audio_url: 'https://cdn.example/b.m4a',
        is_played: false,
        created_at: '2026-09-14T20:01:00.000Z',
      },
      {
        id: 'c',
        driver_id: 'drv-2',
        sender_type: 'driver',
        audio_url: 'https://cdn.example/c.m4a',
        is_played: false,
        created_at: '2026-09-14T20:02:00.000Z',
      },
      {
        id: 'd',
        driver_id: 'drv-1',
        sender_type: 'base',
        audio_url: 'https://cdn.example/d.wav',
        is_played: false,
        created_at: '2026-09-14T20:03:00.000Z',
      },
    ], drivers);

    expect(incoming.map((row) => row.driverId)).toEqual(['drv-2', 'drv-1']);
    expect(incoming[0].name).toBe('Roberto');
    expect(incoming[1].count).toBe(2);
    expect(unreadVoiceCountForDriver(incoming, 'drv-1')).toBe(2);
  });
});

describe('mergeVoiceMessages', () => {
  it('mezcla audios de base y chofer sin duplicar', () => {
    const merged = mergeVoiceMessages(
      [{ id: 'a', sender_type: 'base', created_at: '2026-01-01T10:00:00.000Z' }],
      [
        { id: 'b', sender_type: 'driver', created_at: '2026-01-01T10:01:00.000Z' },
        { id: 'a', sender_type: 'base', created_at: '2026-01-01T10:00:00.000Z' },
      ],
    );
    expect(merged.map((item) => item.id)).toEqual(['a', 'b']);
    expect(mergeVoiceMessage(merged, { audio_url: 'x' })).toEqual(merged);
  });
});
