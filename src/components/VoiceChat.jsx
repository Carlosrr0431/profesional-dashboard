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

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
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
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
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
      const fileName = `${driverId}/base-${Date.now()}.webm`;
      const { error: uploadError } = await supabase.storage
        .from('voice-messages')
        .upload(fileName, blob, { contentType: 'audio/webm', upsert: true });
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
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-light-300/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center">
            <svg className="w-4 h-4 text-accent" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
          </div>
          <div>
            <h4 className="text-sm font-bold text-navy-900">Radio</h4>
            <p className="text-[10px] text-gray-500">Mensajes de voz con {driver?.fullName?.split(' ')[0] || 'chofer'}</p>
          </div>
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-lg bg-light-200 border border-light-300/50 flex items-center justify-center text-gray-400 hover:text-accent transition-all">
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2" style={{ minHeight: 0 }}>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-gray-400">
            <svg className="w-10 h-10 mb-2 text-light-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" /></svg>
            <p className="text-xs">Sin mensajes de voz</p>
            <p className="text-[10px]">Mantené presionado el micrófono para grabar</p>
          </div>
        ) : (
          messages.map((msg) => (
            <VoiceMessage key={msg.id} msg={msg} onPlay={() => playAudio(msg.audio_url)} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Record controls */}
      <div className="px-4 py-3 border-t border-light-300/50">
        {recording ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2 bg-accent/5 border border-accent/20 rounded-xl px-3 py-2.5">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-accent opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-accent" />
              </span>
              <span className="text-sm font-semibold text-accent tabular-nums">{formatSecs(recordingTime)}</span>
              <span className="text-xs text-gray-500">Grabando...</span>
            </div>
            <button onClick={handleCancel} className="w-10 h-10 rounded-full bg-light-200 border border-light-300/50 flex items-center justify-center text-gray-400 hover:text-danger transition-all">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <button
              onClick={handleSend}
              disabled={sending}
              className="w-10 h-10 rounded-full bg-gradient-to-r from-accent to-accent-light flex items-center justify-center text-white shadow-lg shadow-accent/20 hover:shadow-xl transition-all disabled:opacity-50"
            >
              {sending ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              )}
            </button>
          </div>
        ) : (
          <button
            onClick={startRecording}
            className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-accent to-accent-light text-white text-sm font-semibold rounded-xl hover:shadow-lg hover:shadow-accent/20 transition-all"
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

  return (
    <div className={`flex ${isBase ? 'justify-end' : 'justify-start'}`}>
      <button
        onClick={handlePlay}
        className={`flex items-center gap-2 px-3 py-2.5 rounded-2xl max-w-[80%] transition-all ${
          isBase
            ? 'bg-accent/10 border border-accent/20 rounded-br-md'
            : 'bg-light-200 border border-light-300/50 rounded-bl-md'
        }`}
      >
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          playing ? 'bg-accent text-white' : isBase ? 'bg-accent/20 text-accent' : 'bg-light-300 text-gray-500'
        }`}>
          {playing ? (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          )}
        </div>
        <div className="flex flex-col items-start">
          <div className="flex items-center gap-1.5">
            <span className={`text-[10px] font-semibold ${isBase ? 'text-accent' : 'text-navy-900'}`}>
              {isBase ? 'Base' : 'Chofer'}
            </span>
            {msg.duration_seconds > 0 && (
              <span className="text-[10px] text-gray-400">
                {Math.floor(msg.duration_seconds / 60)}:{(msg.duration_seconds % 60).toString().padStart(2, '0')}
              </span>
            )}
          </div>
          <span className="text-[9px] text-gray-400">{time}</span>
        </div>
        {/* Waveform decoration */}
        <div className="flex items-center gap-[2px] ml-1">
          {[3, 5, 8, 5, 7, 4, 6, 8, 5, 3].map((h, i) => (
            <div key={i} className={`w-[2px] rounded-full ${playing ? 'bg-accent animate-pulse' : isBase ? 'bg-accent/30' : 'bg-gray-300'}`} style={{ height: h }} />
          ))}
        </div>
      </button>
    </div>
  );
}
