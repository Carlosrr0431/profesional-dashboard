export const CHATS_LINE_PHONE = '5493872138777';

export function digitsOnly(value) {
  return String(value || '').replace(/\D/g, '');
}

export function isChatsLine(phone) {
  const digits = digitsOnly(phone);
  return digits === CHATS_LINE_PHONE || digits.endsWith('3872138777');
}

export function formatArMobile(phone) {
  const digits = digitsOnly(phone);
  const local = digits.startsWith('549')
    ? digits.slice(3)
    : (digits.startsWith('54') ? digits.slice(2) : digits);
  if (local.length === 10) {
    return `+54 9 ${local.slice(0, 4)} ${local.slice(4, 6)}-${local.slice(6)}`;
  }
  if (!digits) return '';
  return `+${digits}`;
}

export function chatMessagePreview({ messageType, content, transcription } = {}) {
  const text = String(transcription || content || '').replace(/\s+/g, ' ').trim();
  if (text) return text.slice(0, 500);
  const type = String(messageType || '').toLowerCase();
  if (type === 'location' || type === 'live_location') return 'Ubicación';
  if (type === 'audio' || type === 'ptt' || type === 'voice') return 'Audio';
  if (type === 'image') return 'Imagen';
  if (type === 'video') return 'Video';
  if (type === 'sticker') return 'Sticker';
  if (type === 'document') return 'Documento';
  if (type === 'contact' || type === 'contacts') return 'Contacto';
  return 'Mensaje';
}
