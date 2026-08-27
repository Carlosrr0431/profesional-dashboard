'use client';

import { useEffect, useRef, useState } from 'react';
import { SpaButton, SpaIcon } from './ui';
import { formatChatTime } from './tripChat';

export default function TripChatModal({
  open,
  title,
  subtitle = 'Chat del viaje',
  myRole,
  messages,
  loading,
  sending,
  writable,
  onClose,
  onSendText,
}) {
  const [draft, setDraft] = useState('');
  const listRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [open, messages.length]);

  if (!open) return null;

  const submit = async (event) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const result = await onSendText(text);
    if (result?.ok !== false) setDraft('');
  };

  return (
    <div className="spa-chat" role="dialog" aria-label="Chat del viaje">
      <div className="spa-chat-head">
        <button type="button" className="spa-icon-btn" onClick={onClose} aria-label="Cerrar chat">
          <SpaIcon name="close" className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-navy-900">{title}</p>
          <p className="truncate text-[12px] text-slate-500">{subtitle}</p>
        </div>
      </div>
      <div ref={listRef} className="spa-chat-list">
        {loading && messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Cargando mensajes…</p>
        ) : null}
        {!loading && messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Todavía no hay mensajes.</p>
        ) : null}
        {messages.map((message) => {
          const mine = message.sender_role === myRole;
          return (
            <div
              key={message.id || message.client_id}
              className={`spa-chat-bubble ${mine ? 'spa-chat-bubble--me' : 'spa-chat-bubble--them'}`}
            >
              {message.message_type === 'audio' && message.audio_url ? (
                <audio controls src={message.audio_url} className="max-w-full" />
              ) : (
                <p>{message.body}</p>
              )}
              <p className="spa-chat-meta">{formatChatTime(message.created_at)}</p>
            </div>
          );
        })}
      </div>
      <form className="spa-chat-form" onSubmit={submit}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={500}
          disabled={!writable || sending}
          placeholder={writable ? 'Escribí un mensaje' : 'El chat está cerrado'}
        />
        <SpaButton type="submit" disabled={!writable || sending || !draft.trim()} className="!min-h-11 !w-auto px-4">
          Enviar
        </SpaButton>
      </form>
    </div>
  );
}
