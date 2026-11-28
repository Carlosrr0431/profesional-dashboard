const {
  CHATS_LINE_PHONE,
  isChatsLine,
  formatArMobile,
  chatMessagePreview,
  chatDisplayName,
} = require('../../src/lib/cloudflareChats');

describe('archivo de chats de la línea 3872 13-8777', () => {
  test('solo esa línea entra al archivo', () => {
    expect(isChatsLine('5493872138777')).toBe(true);
    expect(isChatsLine('+54 9 3872 13-8777')).toBe(true);
    expect(isChatsLine(CHATS_LINE_PHONE)).toBe(true);
    expect(isChatsLine('5493873088777')).toBe(false);
  });

  test('muestra el celular como en WhatsApp', () => {
    expect(formatArMobile('5493872138777')).toBe('+54 9 3872 13-8777');
  });

  test('el nombre agendado manda y si no está usa el corto del chat', () => {
    expect(chatDisplayName({
      saved_name: 'Carlos Facundo Rodríguez',
      peer_name: 'Carlos',
      peer_phone: '5493878630173',
    })).toBe('Carlos Facundo Rodríguez');
    expect(chatDisplayName({
      saved_name: '',
      peer_name: 'Carlos Rodríguez R.',
      peer_phone: '5493878630173',
    })).toBe('Carlos Rodríguez R.');
    expect(chatDisplayName({ peer_phone: '5493878630173' })).toBe('+54 9 3878 63-0173');
  });

  test('un audio sin texto se ve como Audio', () => {
    expect(chatMessagePreview({ messageType: 'audio' })).toBe('Audio');
    expect(chatMessagePreview({ messageType: 'text', content: 'Hola, ¿dónde te buscamos?' }))
      .toBe('Hola, ¿dónde te buscamos?');
  });
});
