/**
 * Convierte un Blob de audio (cualquier formato que soporte el browser)
 * a WAV PCM 16-bit mono 16kHz — formato universalmente compatible con
 * Android (expo-audio) e iOS sin problemas de codec.
 *
 * 16kHz mono es suficiente para voz y mantiene archivos pequeños
 * (~32KB/s ≈ 1.9MB por minuto).
 */
export async function encodeToWav(blob) {
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  try {
    const arrayBuffer = await blob.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

    const TARGET_SAMPLE_RATE = 16000;
    const offlineCtx = new OfflineAudioContext(
      1,
      Math.ceil(audioBuffer.duration * TARGET_SAMPLE_RATE),
      TARGET_SAMPLE_RATE
    );

    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start(0);

    const rendered = await offlineCtx.startRendering();
    const pcm = rendered.getChannelData(0);

    const wavBuffer = createWavFile(pcm, TARGET_SAMPLE_RATE);
    return new Blob([wavBuffer], { type: 'audio/wav' });
  } finally {
    await audioCtx.close();
  }
}

function createWavFile(samples, sampleRate) {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = samples.length * (bitsPerSample / 8);
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    offset += 2;
  }

  return buffer;
}

function writeString(view, offset, str) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}
