import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  fetchIncomingDriverVoiceViaApi,
  markVoiceMessagesPlayedViaApi,
} from '../lib/voiceMessagesApi';
import { summarizeIncomingDriverVoice } from '../lib/voiceMessages';

const INBOX_POLL_MS = 4000;

export function useIncomingDriverVoice(drivers) {
  const [messages, setMessages] = useState([]);

  const refresh = useCallback(async () => {
    try {
      const rows = await fetchIncomingDriverVoiceViaApi();
      setMessages(Array.isArray(rows) ? rows : []);
    } catch {
      // El mapa sigue usable si el inbox falla un ciclo.
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const rows = await fetchIncomingDriverVoiceViaApi();
        if (!cancelled) setMessages(Array.isArray(rows) ? rows : []);
      } catch {
        // ignore
      }
    };
    load();
    const pollId = setInterval(load, INBOX_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(pollId);
    };
  }, []);

  const incoming = useMemo(
    () => summarizeIncomingDriverVoice(messages, drivers),
    [messages, drivers],
  );

  const unreadCount = useMemo(
    () => incoming.reduce((sum, row) => sum + (row.count || 0), 0),
    [incoming],
  );

  const markPlayed = useCallback(async (ids) => {
    const messageIds = [...new Set((ids || []).map((id) => String(id || '').trim()).filter(Boolean))];
    if (messageIds.length === 0) return;
    setMessages((prev) => prev.filter((row) => !messageIds.includes(String(row.id))));
    try {
      await markVoiceMessagesPlayedViaApi(messageIds);
    } catch {
      refresh();
    }
  }, [refresh]);

  return { incoming, unreadCount, markPlayed, refresh };
}
