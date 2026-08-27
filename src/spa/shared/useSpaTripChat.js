'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { spaJson, passengerHeaders } from './api';
import {
  TRIP_CHAT_MAX_TEXT_LENGTH,
  TRIP_CHAT_MESSAGE_FIELDS,
  isTripChatAvailable,
  mergeChatMessage,
} from './tripChat';

function newClientId(role) {
  const prefix = role === 'driver' ? 'd' : 'p';
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useSpaTripChat({
  role,
  tripId,
  tripStatus,
  enabled = true,
  passengerAuth = null,
  getSupabase = null,
} = {}) {
  const writable = isTripChatAvailable(tripStatus);
  const myRole = role === 'driver' ? 'driver' : 'passenger';
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const chatOpenRef = useRef(false);
  const knownIdsRef = useRef(new Set());

  chatOpenRef.current = chatOpen;

  const remember = useCallback((list) => {
    const ids = new Set(knownIdsRef.current);
    (list || []).forEach((item) => {
      if (item?.id) ids.add(item.id);
      if (item?.client_id) ids.add(item.client_id);
    });
    knownIdsRef.current = ids;
  }, []);

  const applyIncoming = useCallback((incoming, { countUnread = true } = {}) => {
    const list = Array.isArray(incoming) ? incoming : [incoming];
    setMessages((prev) => {
      let next = prev;
      list.forEach((msg) => {
        next = mergeChatMessage(next, msg);
      });
      return next;
    });
    if (countUnread && !chatOpenRef.current) {
      const fresh = list.filter((msg) => {
        const key = msg?.id || msg?.client_id;
        return key && !knownIdsRef.current.has(key) && msg.sender_role !== myRole;
      });
      if (fresh.length) setUnreadCount((n) => n + fresh.length);
    }
    remember(list);
  }, [myRole, remember]);

  const fetchPassenger = useCallback(async (countUnread = true) => {
    if (!tripId || !passengerAuth?.phone || !passengerAuth?.sessionToken) return;
    const params = new URLSearchParams({
      tripId: String(tripId),
      phone: String(passengerAuth.phone),
      sessionToken: String(passengerAuth.sessionToken),
    });
    const { ok, data } = await spaJson(`/api/trips/chat?${params.toString()}`, {
      headers: passengerHeaders(),
    });
    if (!ok || !data?.ok) return;
    applyIncoming(data.messages || [], { countUnread });
  }, [applyIncoming, passengerAuth?.phone, passengerAuth?.sessionToken, tripId]);

  const fetchDriver = useCallback(async (countUnread = true) => {
    if (!tripId || !getSupabase) return;
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('trip_chat_messages')
      .select(TRIP_CHAT_MESSAGE_FIELDS)
      .eq('trip_id', tripId)
      .order('created_at', { ascending: true })
      .limit(120);
    if (!error) applyIncoming(data || [], { countUnread });
  }, [applyIncoming, getSupabase, tripId]);

  useEffect(() => {
    if (!enabled || !tripId || !writable) {
      setMessages([]);
      setUnreadCount(0);
      knownIdsRef.current = new Set();
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    const boot = async () => {
      if (myRole === 'passenger') await fetchPassenger(false);
      else await fetchDriver(false);
      if (!cancelled) setLoading(false);
    };
    boot();

    const pollMs = chatOpen ? 2000 : 4000;
    const timer = myRole === 'passenger'
      ? setInterval(fetchPassenger, pollMs)
      : null;

    let channel = null;
    if (myRole === 'driver' && getSupabase) {
      const supabase = getSupabase();
      channel = supabase
        .channel(`spa_trip_chat_${tripId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'trip_chat_messages',
            filter: `trip_id=eq.${tripId}`,
          },
          (payload) => applyIncoming(payload.new),
        )
        .subscribe();
    }

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      if (channel && getSupabase) getSupabase().removeChannel(channel);
    };
  }, [applyIncoming, chatOpen, enabled, fetchDriver, fetchPassenger, getSupabase, myRole, tripId, writable]);

  const openChat = useCallback(() => {
    setChatOpen(true);
    setUnreadCount(0);
  }, []);

  const closeChat = useCallback(() => {
    setChatOpen(false);
  }, []);

  const sendText = useCallback(async (raw) => {
    const body = String(raw || '').replace(/\s+/g, ' ').trim().slice(0, TRIP_CHAT_MAX_TEXT_LENGTH);
    if (!body || !writable || !tripId || sending) return { ok: false };
    const clientId = newClientId(myRole);
    const optimistic = {
      id: clientId,
      client_id: clientId,
      trip_id: tripId,
      sender_role: myRole,
      message_type: 'text',
      body,
      created_at: new Date().toISOString(),
    };
    applyIncoming(optimistic);
    setSending(true);
    try {
      if (myRole === 'passenger') {
        const { ok, data } = await spaJson('/api/trips/chat', {
          method: 'POST',
          headers: passengerHeaders(),
          body: {
            tripId,
            phone: passengerAuth?.phone,
            sessionToken: passengerAuth?.sessionToken,
            messageType: 'text',
            body,
            clientId,
          },
        });
        if (!ok || !data?.ok) throw new Error(data?.message || 'No se pudo enviar.');
        if (data.message) applyIncoming(data.message);
        return { ok: true };
      }

      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('trip_chat_messages')
        .insert({
          trip_id: tripId,
          sender_role: 'driver',
          message_type: 'text',
          body,
          client_id: clientId,
        })
        .select(TRIP_CHAT_MESSAGE_FIELDS)
        .single();
      if (error) throw error;
      applyIncoming(data);
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (token) {
        spaJson('/api/trips/chat/notify', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: {
            tripId,
            messageId: data.id,
            messageType: 'text',
            body,
            senderRole: 'driver',
          },
        }).catch(() => {});
      }
      return { ok: true };
    } catch (err) {
      setMessages((prev) => prev.filter((item) => item.client_id !== clientId));
      return { ok: false, message: err.message || 'No se pudo enviar.' };
    } finally {
      setSending(false);
    }
  }, [applyIncoming, getSupabase, myRole, passengerAuth?.phone, passengerAuth?.sessionToken, sending, tripId, writable]);

  return {
    messages,
    loading,
    sending,
    unreadCount,
    writable,
    chatOpen,
    openChat,
    closeChat,
    sendText,
    myRole,
  };
}
