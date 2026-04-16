import { useState, useRef } from 'react';
import { supabase } from '../lib/supabase';

export default function BroadcastVoiceChat({ drivers, onClose }) {
  const [recording, setRecording] = useState(false);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

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
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 44100, channelCount: 1 },
      });
      const mimeInfo = mimeInfoRef.current;
      const mediaRecorder = new MediaRecorder(stream, { mimeType: mimeInfo.mimeType, audioBitsPerSecond: 128000 });
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
    if (!blob || blob.size === 0 || drivers.length === 0) return;

    setSending(true);
    try {
      const mimeInfo = mimeInfoRef.current;
      const timestamp = Date.now();
      const fileName = `broadcast/base-${timestamp}.${mimeInfo.ext}`;

      // Upload audio once
      const { error: uploadError } = await supabase.storage
        .from('voice-messages')
        .upload(fileName, blob, { contentType: mimeInfo.contentType, upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from('voice-messages').getPublicUrl(fileName);

      // Insert a voice message for each selected driver
      const rows = drivers.map((d) => ({
        driver_id: d.id,
        sender_type: 'base',
        audio_url: urlData.publicUrl,
        duration_seconds: recordingTime,
      }));

      const { error: insertError } = await supabase
        .from('voice_messages')
        .insert(rows);
      if (insertError) throw insertError;

      setSent(true);
      setTimeout(() => setSent(false), 3000);
    } catch (err) {
      console.error('Error sending broadcast voice:', err);
    } finally {
      setSending(false);
      setRecordingTime(0);
    }
  };

  const handleCancel = () => {
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
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[480px] max-w-[calc(100%-2rem)]">
      <div className="bg-light-50 border border-light-300/50 rounded-2xl shadow-2xl shadow-black/20 overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-light-300/50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-accent/20 to-accent/5 flex items-center justify-center">
              <svg className="w-4.5 h-4.5 text-accent" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/><path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/></svg>
            </div>
            <div>
              <h4 className="text-sm font-bold text-navy-900 leading-tight">Audio grupal</h4>
              <p className="text-[10px] text-gray-500 leading-tight">
                {drivers.length} chofer{drivers.length !== 1 ? 'es' : ''} seleccionado{drivers.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-lg bg-light-200 border border-light-300/50 flex items-center justify-center text-gray-400 hover:text-accent hover:border-accent/30 transition-all">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Driver chips */}
        <div className="px-4 py-2 flex flex-wrap gap-1.5 max-h-20 overflow-y-auto">
          {drivers.map((d) => (
            <span key={d.id} className="inline-flex items-center gap-1 bg-accent/10 text-accent text-[10px] font-semibold px-2 py-1 rounded-lg">
              {d.fullName.split(' ')[0]}
              {d.driverNumber != null && <span className="text-accent/60">#{d.driverNumber}</span>}
            </span>
          ))}
        </div>

        {/* Sent confirmation */}
        {sent && (
          <div className="mx-4 mb-2 flex items-center gap-2 bg-online/10 border border-online/20 rounded-xl px-3 py-2">
            <svg className="w-4 h-4 text-online flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
            <span className="text-xs font-medium text-online">Audio enviado a {drivers.length} chofer{drivers.length !== 1 ? 'es' : ''}</span>
          </div>
        )}

        {/* Record controls */}
        <div className="px-4 py-3 border-t border-light-300/50">
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
              Grabar audio grupal
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
