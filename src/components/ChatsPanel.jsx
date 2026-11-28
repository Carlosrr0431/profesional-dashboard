'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CHATS_LINE_PHONE, formatArMobile } from '../lib/chatDisplay';

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
  const name = String(chat?.peer_name || '').trim();
  if (name) return name;
  return formatArMobile(chat?.peer_phone) || 'Contacto';
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

  return (
    <div className="flex h-full min-h-0 w-full bg-[#f0f2f5] text-slate-800">
      <aside className={`w-full max-w-[380px] shrink-0 border-r border-slate-200 bg-white ${selectedId ? 'hidden md:flex' : 'flex'} min-h-0 flex-col`}>
        <header className="border-b border-slate-200 px-4 py-3">
          <p className="text-[15px] font-semibold text-slate-900">Chats</p>
          <p className="text-[12px] text-slate-500">{formatArMobile(CHATS_LINE_PHONE)}</p>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar un chat"
            className="mt-3 h-9 w-full rounded-lg bg-[#f0f2f5] px-3 text-[13px] outline-none"
          />
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {visibleChats.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-slate-500">
              {error || 'Todavía no hay mensajes. Cuando alguien escriba a esta línea, el chat aparece acá.'}
            </p>
          ) : visibleChats.map((chat) => {
            const active = chat.id === selectedId;
            const unread = Number(chat.unread) || 0;
            return (
              <button
                key={chat.id}
                type="button"
                onClick={() => openChat(chat)}
                className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left ${active ? 'bg-[#f0f2f5]' : 'hover:bg-slate-50'}`}
              >
                <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#00a884] text-[14px] font-semibold text-white">
                  {chatTitle(chat).slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[14px] font-semibold">{chatTitle(chat)}</span>
                    <span className="shrink-0 text-[11px] text-slate-400">{whenLabel(chat.last_at)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center justify-between gap-2">
                    <span className="truncate text-[13px] text-slate-500">{chat.last_body || 'Mensaje'}</span>
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
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-[#f0f2f5] px-3">
              <button
                type="button"
                className="rounded-full px-2 py-1 text-[13px] font-semibold text-[#02735e] md:hidden"
                onClick={() => setSelectedId('')}
              >
                Chats
              </button>
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold">{chatTitle(selected)}</p>
                <p className="truncate text-[12px] text-slate-500">{formatArMobile(selected.peer_phone)}</p>
              </div>
            </header>
            <div
              ref={threadRef}
              onScroll={onThreadScroll}
              className="min-h-0 flex-1 overflow-y-auto bg-[#efeae2] px-3 py-4"
              style={{ backgroundImage: 'radial-gradient(rgba(17,27,33,0.04) 0.6px, transparent 0.6px)', backgroundSize: '14px 14px' }}
            >
              {hasMore ? (
                <div className="mb-3 flex justify-center">
                  <button
                    type="button"
                    onClick={loadOlder}
                    disabled={loadingOlder}
                    className="rounded-full bg-white px-3 py-1 text-[12px] font-semibold text-slate-600 shadow-sm"
                  >
                    {loadingOlder ? 'Cargando…' : 'Mensajes anteriores'}
                  </button>
                </div>
              ) : null}
              <div className="mx-auto flex max-w-3xl flex-col gap-1.5">
                {messages.map((message) => {
                  const outgoing = message.direction === 'outgoing';
                  return (
                    <div key={message.id} className={`flex ${outgoing ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-[78%] rounded-lg px-2.5 py-1.5 shadow-sm ${outgoing ? 'bg-[#d9fdd3]' : 'bg-white'}`}>
                        <p className="whitespace-pre-wrap break-words text-[14px] leading-5">{message.body || 'Mensaje'}</p>
                        <p className="mt-0.5 text-right text-[11px] text-slate-400">{whenLabel(message.sent_at)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center px-6 text-center">
            <div>
              <p className="text-[18px] font-semibold text-slate-700">Historial de WhatsApp</p>
              <p className="mt-1 max-w-sm text-[13px] text-slate-500">
                Elegí un chat para ver todos los mensajes de {formatArMobile(CHATS_LINE_PHONE)}. Se actualiza solo.
              </p>
              {error ? <p className="mt-3 text-[13px] text-rose-600">{error}</p> : null}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
