'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CHATS_LINE_PHONE, chatDisplayName, chatShortName, formatArMobile } from '../lib/chatDisplay';

const timeFormatter = new Intl.DateTimeFormat('es-AR', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
  timeZone: 'America/Argentina/Salta',
});
const dayFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: 'short',
  timeZone: 'America/Argentina/Salta',
});

function sameDay(a, b) {
  const left = new Date(a);
  const right = new Date(b);
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function whenLabel(sentAt) {
  const value = Number(sentAt);
  if (!Number.isFinite(value) || value <= 0) return '';
  return sameDay(value, Date.now()) ? timeFormatter.format(value) : dayFormatter.format(value);
}

function chatTitle(chat) {
  return chatDisplayName(chat);
}

function chatSubtitle(chat) {
  const title = chatTitle(chat);
  const shortName = chatShortName(chat);
  const phone = formatArMobile(chat?.peer_phone);
  if (shortName && shortName.toLowerCase() !== title.toLowerCase()) return shortName;
  return phone;
}

function mergeMessages(current, incoming) {
  const map = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) map.set(item.id, item);
  return [...map.values()].sort((a, b) => Number(a.sent_at) - Number(b.sent_at));
}

export default function ChatsPanel() {
  const [chats, setChats] = useState([]);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [loadingOlder, setLoadingOlder] = useState(false);
  const threadRef = useRef(null);
  const stickToBottomRef = useRef(true);

  const loadChats = useCallback(async () => {
    const response = await fetch('/api/chats', { cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.message || 'No se pudo leer los chats.');
    }
    setChats(Array.isArray(payload.chats) ? payload.chats : []);
    setError('');
  }, []);

  const loadMessages = useCallback(async (chatId, { before, replace } = {}) => {
    const params = new URLSearchParams({ chat: chatId });
    if (before) params.set('before', String(before));
    const response = await fetch(`/api/chats/messages?${params}`, { cache: 'no-store' });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.message || 'No se pudo leer el historial.');
    }
    const incoming = Array.isArray(payload.messages) ? payload.messages : [];
    setMessages((current) => (replace ? incoming : mergeMessages(current, incoming)));
    if (!before) setHasMore(Boolean(payload.hasMore));
    else setHasMore(Boolean(payload.hasMore));
    return incoming;
  }, []);

  useEffect(() => {
    let stop = false;
    const tick = () => {
      loadChats().catch((err) => {
        if (!stop) setError(err?.message || 'No se pudo leer los chats.');
      });
    };
    tick();
    const timer = setInterval(tick, 2500);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [loadChats]);

  useEffect(() => {
    if (!selectedId) return undefined;
    let stop = false;
    stickToBottomRef.current = true;
    const tick = () => {
      loadMessages(selectedId).catch((err) => {
        if (!stop) setError(err?.message || 'No se pudo leer el historial.');
      });
    };
    tick();
    const timer = setInterval(tick, 2000);
    fetch('/api/chats/read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chatId: selectedId }),
    }).catch(() => null);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [selectedId, loadMessages]);

  useEffect(() => {
    const node = threadRef.current;
    if (!node || !stickToBottomRef.current) return;
    node.scrollTop = node.scrollHeight;
  }, [messages, selectedId]);

  const visibleChats = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return chats;
    return chats.filter((chat) => {
      const blob = `${chat.peer_name || ''} ${chat.peer_phone || ''} ${chat.last_body || ''}`.toLowerCase();
      return blob.includes(needle);
    });
  }, [chats, query]);

  const selected = chats.find((chat) => chat.id === selectedId) || null;

  const openChat = (chat) => {
    setMessages([]);
    setHasMore(false);
    setSelectedId(chat.id);
    setError('');
  };

  const loadOlder = async () => {
    const oldest = messages[0]?.sent_at;
    if (!selectedId || !oldest || loadingOlder) return;
    stickToBottomRef.current = false;
    setLoadingOlder(true);
    try {
      await loadMessages(selectedId, { before: oldest });
    } catch (err) {
      setError(err?.message || 'No se pudo leer el historial.');
    } finally {
      setLoadingOlder(false);
    }
  };

  const onThreadScroll = () => {
    const node = threadRef.current;
    if (!node) return;
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    stickToBottomRef.current = distance < 80;
  };

  const selectedTitle = selected ? chatTitle(selected) : '';

  return (
    <div className="flex h-full min-h-0 w-full bg-[#efeae2] text-[#111b21]">
      <aside className={`w-full max-w-[400px] shrink-0 border-r border-[#e9edef] bg-white ${selectedId ? 'hidden md:flex' : 'flex'} min-h-0 flex-col`}>
        <header className="bg-[#f0f2f5] px-4 pb-3 pt-4">
          <div className="flex items-center justify-between">
            <p className="text-[20px] font-semibold tracking-tight">Chats</p>
            <p className="text-[12px] font-medium text-[#54656f]">{formatArMobile(CHATS_LINE_PHONE)}</p>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar o empezar un chat"
            className="mt-3 h-9 w-full rounded-lg border-0 bg-white px-3 text-[13px] outline-none ring-1 ring-transparent placeholder:text-[#667781] focus:ring-[#00a884]"
          />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visibleChats.length === 0 ? (
            <p className="px-6 py-10 text-center text-[13px] leading-5 text-[#667781]">
              {error || 'Todavía no hay mensajes. Cuando alguien escriba a esta línea, el chat aparece acá.'}
            </p>
          ) : visibleChats.map((chat) => {
            const active = chat.id === selectedId;
            const unread = Number(chat.unread) || 0;
            const title = chatTitle(chat);
            const preview = chat.last_direction === 'outgoing'
              ? `Vos: ${chat.last_body || 'Mensaje'}`
              : (chat.last_body || 'Mensaje');
            return (
              <button
                key={chat.id}
                type="button"
                onClick={() => openChat(chat)}
                className={`flex w-full items-center px-4 py-2.5 text-left ${active ? 'bg-[#f0f2f5]' : 'hover:bg-[#f5f6f6]'}`}
              >
                <span className="min-w-0 flex-1 border-b border-[#e9edef] py-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[16px]">{title}</span>
                    <span className={`shrink-0 text-[12px] ${unread > 0 ? 'font-medium text-[#02735e]' : 'text-[#667781]'}`}>
                      {whenLabel(chat.last_at)}
                    </span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] text-[#667781]">{preview}</span>
                    {unread > 0 ? (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-[#00a884] px-1.5 text-[11px] font-semibold text-white">
                        {unread}
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className={`min-h-0 min-w-0 flex-1 flex-col ${selectedId ? 'flex' : 'hidden md:flex'}`}>
        {selected ? (
          <>
            <header className="flex h-[60px] shrink-0 items-center gap-3 bg-[#f0f2f5] px-4">
              <button
                type="button"
                className="rounded-full px-2 py-1 text-[13px] font-semibold text-[#02735e] md:hidden"
                onClick={() => setSelectedId('')}
              >
                Atrás
              </button>
              <div className="min-w-0">
                <p className="truncate text-[16px] font-medium">{selectedTitle}</p>
                <p className="truncate text-[12px] text-[#667781]">{chatSubtitle(selected)}</p>
              </div>
            </header>
            <div
              ref={threadRef}
              onScroll={onThreadScroll}
              className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
              style={{
                backgroundColor: '#efeae2',
                backgroundImage: 'radial-gradient(rgba(17,27,33,0.045) 0.7px, transparent 0.7px)',
                backgroundSize: '16px 16px',
              }}
            >
              <div className="mx-auto flex min-h-full max-w-3xl flex-col justify-end gap-1">
                {hasMore ? (
                  <div className="mb-2 flex justify-center">
                    <button
                      type="button"
                      onClick={loadOlder}
                      disabled={loadingOlder}
                      className="rounded-full bg-white px-3 py-1 text-[12px] font-medium text-[#54656f] shadow-sm"
                    >
                      {loadingOlder ? 'Cargando…' : 'Mensajes anteriores'}
                    </button>
                  </div>
                ) : null}
                {messages.map((message, index) => {
                  const outgoing = message.direction === 'outgoing';
                  const previous = messages[index - 1];
                  const showDay = !previous || !sameDay(previous.sent_at, message.sent_at);
                  return (
                    <div key={message.id}>
                      {showDay ? (
                        <div className="my-2 flex justify-center">
                          <span className="rounded-lg bg-white px-2 py-1 text-[12px] text-[#54656f] shadow-sm">
                            {sameDay(message.sent_at, Date.now()) ? 'Hoy' : dayFormatter.format(Number(message.sent_at))}
                          </span>
                        </div>
                      ) : null}
                      <div className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[75%] rounded-lg px-2 py-1 shadow-sm ${outgoing ? 'rounded-tr-none bg-[#d9fdd3]' : 'rounded-tl-none bg-white'}`}>
                          <p className="whitespace-pre-wrap break-words px-1 text-[14.5px] leading-5">{message.body || 'Mensaje'}</p>
                          <p className="px-1 text-right text-[11px] text-[#667781]">{whenLabel(message.sent_at)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="hidden flex-1 flex-col items-center justify-center bg-[#f0f2f5] px-8 text-center md:flex">
            <p className="text-[28px] font-light text-[#41525d]">WhatsApp de Profesional</p>
            <p className="mt-2 max-w-md text-[14px] leading-6 text-[#667781]">
              Elegí un chat para ver el historial de {formatArMobile(CHATS_LINE_PHONE)}. El nombre es el de la agenda y, si no está guardado, el que figura en el chat.
            </p>
            {error ? <p className="mt-3 text-[13px] text-rose-600">{error}</p> : null}
          </div>
        )}
      </section>
    </div>
  );
}
