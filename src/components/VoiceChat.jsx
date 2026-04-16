import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export default function VoiceChat({ driver, onClose }) {
  const [messages, setMessages] = useState([]);
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const channelRef = useRef(null);
  const timerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);

  const driverId = driver?.id;

  // Fetch messages
  const fetchMessages = useCallback(async () => {
    if (!driverId) return;
    try {
      const { data, error } = await supabase
        .from('voice_messages')
        .select('*')
        .eq('driver_id', driverId)
        .order('created_at', { ascending: true })
        .limit(50);
      if (!error) setMessages(data || []);
    } catch (err) {
      console.error('Error fetching voice messages:', err);
    } finally {
      setLoading(false);
    }
  }, [driverId]);

  // Realtime subscription
  useEffect(() => {
    if (!driverId) return;
    fetchMessages();

    channelRef.current = supabase
      .channel(`voice_${driverId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'voice_messages',
        filter: `driver_id=eq.${driverId}`,
      }, (payload) => {
        const msg = payload.new;
        setMessages((prev) => [...prev, msg]);
        // Auto-play if from driver
        if (msg.sender_type === 'driver' && msg.audio_url) {
          playAudio(msg.audio_url);
        }
      })
      .subscribe();

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [driverId, fetchMessages]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const playAudio = (url) => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.play().catch(() => {});
  };

  const getSupportedMime = () => {
    if (typeof MediaRecorder !== 'undefined') {
      if (MediaRecorder.isTypeSupported('audio/mp4')) return { mimeType: 'audio/mp4', ext: 'mp4', contentType: 'audio/mp4' };
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) return { mimeType: 'audio/webm;codecs=opus', ext: 'webm', contentType: 'audio/webm' };
      if (MediaRecorder.isTypeSupported('audio/webm')) return { mimeType: 'audio/webm', ext: 'webm', contentType: 'audio/webm' };
    }
    return { mimeType: 'audio/webm', ext: 'webm', contentType: 'audio/webm' };
  };

  const mimeInfoRef = useRef(getSupportedMime());

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 44100,
          channelCount: 1,
        },
      });
      const mimeInfo = mimeInfoRef.current;
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeInfo.mimeType,
        audioBitsPerSecond: 128000,
      });
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start();
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch (err) {
      console.error('Mic access denied:', err);
    }
  };

  const stopRecording = () => {
    return new Promise((resolve) => {
      const mediaRecorder = mediaRecorderRef.current;
      if (!mediaRecorder || mediaRecorder.state === 'inactive') { resolve(null); return; }

      mediaRecorder.onstop = () => {
        const mimeInfo = mimeInfoRef.current;
        const blob = new Blob(chunksRef.current, { type: mimeInfo.contentType });
        // Stop all tracks
        mediaRecorder.stream.getTracks().forEach((t) => t.stop());
        resolve(blob);
      };

      mediaRecorder.stop();
      setRecording(false);
      clearInterval(timerRef.current);
    });
  };

  const handleSend = async () => {
    const blob = await stopRecording();
    if (!blob || blob.size === 0) return;

    setSending(true);
    try {
      const mimeInfo = mimeInfoRef.current;
      const fileName = `${driverId}/base-${Date.now()}.${mimeInfo.ext}`;
      const { error: uploadError } = await supabase.storage
        .from('voice-messages')
        .upload(fileName, blob, { contentType: mimeInfo.contentType, upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('voice-messages').getPublicUrl(fileName);

      const { error: insertError } = await supabase
        .from('voice_messages')
        .insert({
          driver_id: driverId,
          sender_type: 'base',
          audio_url: urlData.publicUrl,
          duration_seconds: recordingTime,
        });
      if (insertError) throw insertError;
    } catch (err) {
      console.error('Error sending voice:', err);
    } finally {
      setSending(false);
      setRecordingTime(0);
    }
  };

  const handleCancel = async () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stream.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
    clearInterval(timerRef.current);
    setRecordingTime(0);
  };

  const formatSecs = (s) => `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-4 py-3 border-b border-light-300/50 flex items-center justify-between bg-light-50">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center">
            <svg className="w-4.5 h-4.5 text-accent" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
          </div>
          <div>
            <h4 className="text-sm font-bold text-navy-900 leading-tight">Radio</h4>
            <p className="text-[10px] text-gray-500 leading-tight">Mensajes de voz con {driver?.fullName?.split(' ')[0] || 'chofer'}</p>
          </div>
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-lg bg-light-200 border border-light-300/50 flex items-center justify-center text-gray-400 hover:text-accent hover:border-accent/30 transition-all">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Messages area with scroll */}
      <div className="flex-1 overflow-y-auto overscroll-contain" style={{ minHeight: 0 }}>
        <div className="p-3 space-y-2">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-light-200 flex items-center justify-center mb-3">
                <svg className="w-7 h-7 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
              </div>
              <p className="text-xs font-medium text-gray-400">Sin mensajes de voz</p>
              <p className="text-[10px] text-gray-400/70 mt-0.5">Presioná grabar para enviar un mensaje</p>
            </div>
          ) : (
            messages.map((msg) => (
              <VoiceMessage key={msg.id} msg={msg} onPlay={() => playAudio(msg.audio_url)} />
            ))
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Record controls */}
      <div className="flex-shrink-0 px-4 py-3 border-t border-light-300/50 bg-light-50">
        {recording ? (
          <div className="flex items-center gap-2.5">
            <div className="flex-1 flex items-center gap-2.5 bg-accent/5 border border-accent/20 rounded-xl px-3 py-2.5">
              <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-accent" />
              </span>
              <span className="text-sm font-semibold text-accent tabular-nums">{formatSecs(recordingTime)}</span>
              <span className="text-[11px] text-gray-500">Grabando...</span>
            </div>
            <button onClick={handleCancel} className="w-9 h-9 rounded-full bg-light-200 border border-light-300/50 flex items-center justify-center text-gray-400 hover:text-danger hover:border-danger/30 transition-all flex-shrink-0">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="w-9 h-9 rounded-full bg-gradient-to-r from-accent to-accent-light flex items-center justify-center text-white shadow-lg shadow-accent/20 hover:shadow-xl transition-all disabled:opacity-50 flex-shrink-0"
            >
              {sending ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              )}
            </button>
          </div>
        ) : (
          <button
            onClick={startRecording}
            className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-accent to-accent-light text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-accent/20 active:scale-[0.98] transition-all"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
            Mantené para grabar mensaje
          </button>
        )}
      </div>
    </div>
  );
}

function VoiceMessage({ msg, onPlay }) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef(null);
  const isBase = msg.sender_type === 'base';
  const time = new Date(msg.created_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });

  const handlePlay = () => {
    if (audioRef.current && playing) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setPlaying(false);
      return;
    }
    const audio = new Audio(msg.audio_url);
    audioRef.current = audio;
    audio.onended = () => setPlaying(false);
    audio.play().then(() => setPlaying(true)).catch(() => {});
  };

  const durationStr = msg.duration_seconds > 0
    ? `${Math.floor(msg.duration_seconds / 60)}:${(msg.duration_seconds % 60).toString().padStart(2, '0')}`
    : null;

  return (
    <div className={`flex ${isBase ? 'justify-end' : 'justify-start'}`}>
      <button
        onClick={handlePlay}
        className={`group flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl max-w-[85%] transition-all hover:shadow-sm ${
          isBase
            ? 'bg-accent/8 border border-accent/15 rounded-br-lg'
            : 'bg-light-200/80 border border-light-300/40 rounded-bl-lg'
        }`}
      >
        {/* Play button */}
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
          playing
            ? 'bg-accent text-white shadow-md shadow-accent/25'
            : isBase
              ? 'bg-accent/15 text-accent group-hover:bg-accent/25'
              : 'bg-light-300/80 text-gray-500 group-hover:bg-light-300'
        }`}>
          {playing ? (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          ) : (
            <svg className="w-3.5 h-3.5 ml-0.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          )}
        </div>

        {/* Info */}
        <div className="flex flex-col items-start min-w-0">
          <div className="flex items-center gap-1.5">
            <span className={`text-[11px] font-semibold ${isBase ? 'text-accent' : 'text-navy-900'}`}>
              {isBase ? 'Base' : 'Chofer'}
            </span>
            {durationStr && (
              <span className="text-[10px] text-gray-400 tabular-nums">{durationStr}</span>
            )}
          </div>
          <span className="text-[9px] text-gray-400 mt-0.5">{time}</span>
        </div>

        {/* Waveform */}
        <div className="flex items-center gap-[2px] ml-1 flex-shrink-0">
          {[3, 5, 8, 5, 7, 4, 6, 8, 5, 3].map((h, i) => (
            <div
              key={i}
              className={`w-[2px] rounded-full transition-colors ${
                playing
                  ? 'bg-accent animate-pulse'
                  : isBase ? 'bg-accent/25' : 'bg-gray-300/80'
              }`}
              style={{ height: h }}
            />
          ))}
        </div>
      </button>
    </div>
  );
}
