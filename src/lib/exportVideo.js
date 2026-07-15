import { ArrayBufferTarget, Muxer } from 'mp4-muxer';
import { renderOfflineAudio } from './audio.js';
import { renderProjectFrame } from './renderer.js';
import { projectDuration, resolvedCards } from '../utils/data.js';
import { downloadBlob, sanitizeFilename } from '../utils/assets.js';

function delay(ms = 0) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForQueue(encoder, max = 8) {
  while (encoder.encodeQueueSize > max) await delay(2);
}

async function supportsVideoConfig(config) {
  if (!globalThis.VideoEncoder) return false;
  try {
    return (await VideoEncoder.isConfigSupported(config)).supported;
  } catch {
    return false;
  }
}

async function supportsAudioConfig(config) {
  if (!globalThis.AudioEncoder) return false;
  try {
    return (await AudioEncoder.isConfigSupported(config)).supported;
  } catch {
    return false;
  }
}

function abortIfNeeded(signal) {
  if (signal?.aborted) throw new DOMException('Export canceled', 'AbortError');
}

async function encodeAudio(buffer, muxer, signal, onProgress) {
  const config = {
    codec: 'mp4a.40.2',
    sampleRate: buffer.sampleRate,
    numberOfChannels: Math.min(2, buffer.numberOfChannels),
    bitrate: 256_000,
  };
  if (!(await supportsAudioConfig(config))) {
    throw new Error('This browser cannot encode AAC audio through WebCodecs.');
  }
  let encoderError = null;
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (error) => { encoderError = error; },
  });
  encoder.configure(config);
  const channels = config.numberOfChannels;
  const frameSize = 1024;
  for (let offset = 0; offset < buffer.length; offset += frameSize) {
    abortIfNeeded(signal);
    const frames = Math.min(frameSize, buffer.length - offset);
    const planar = new Float32Array(frames * channels);
    for (let channel = 0; channel < channels; channel += 1) {
      planar.set(buffer.getChannelData(channel).subarray(offset, offset + frames), channel * frames);
    }
    const data = new AudioData({
      format: 'f32-planar',
      sampleRate: buffer.sampleRate,
      numberOfFrames: frames,
      numberOfChannels: channels,
      timestamp: Math.round((offset / buffer.sampleRate) * 1_000_000),
      data: planar,
    });
    encoder.encode(data);
    data.close();
    if (encoder.encodeQueueSize > 12) await delay(1);
    if (offset % (frameSize * 40) === 0) onProgress?.(0.78 + 0.18 * (offset / buffer.length), 'Encoding soundtrack');
  }
  await encoder.flush();
  encoder.close();
  if (encoderError) throw encoderError;
}

export async function exportProjectMp4({
  project,
  images,
  bakedImages,
  filename = 'cts-comparison',
  onProgress,
  signal,
}) {
  const width = Math.max(320, Math.floor(project.settings.width || 1920));
  const height = Math.max(180, Math.floor(project.settings.height || 1080));
  const fps = Math.max(1, Math.min(60, Math.floor(project.settings.fps || 30)));
  const duration = projectDuration(project);
  if (!duration || !resolvedCards(project).length) throw new Error('Add at least one non-empty card before exporting.');

  const pixelsPerSecond = width * height * fps;
  const codec = pixelsPerSecond > 1920 * 1080 * 60
    ? 'avc1.640033'
    : pixelsPerSecond > 1280 * 720 * 30
      ? 'avc1.42002a'
      : 'avc1.42001f';
  const videoConfig = {
    codec,
    width,
    height,
    bitrate: Math.max(4_000_000, Math.round(width * height * fps * 0.11)),
    framerate: fps,
    avc: { format: 'avc' },
    hardwareAcceleration: 'prefer-hardware',
  };
  if (!(await supportsVideoConfig(videoConfig))) {
    throw new Error('H.264 WebCodecs export is unavailable in this browser. Use a current Chromium-based browser with hardware video encoding enabled.');
  }

  const hasAudio = project.audioTracks.some((track) => track.src);
  let mixedAudio = null;
  if (hasAudio) {
    onProgress?.(0.01, 'Mixing soundtrack');
    mixedAudio = await renderOfflineAudio(project, duration);
  }
  abortIfNeeded(signal);

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: { codec: 'avc', width, height },
    audio: mixedAudio
      ? { codec: 'aac', sampleRate: mixedAudio.sampleRate, numberOfChannels: Math.min(2, mixedAudio.numberOfChannels) }
      : undefined,
    fastStart: 'in-memory',
    firstTimestampBehavior: 'offset',
  });

  let encoderError = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (error) => { encoderError = error; },
  });
  encoder.configure(videoConfig);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
  const totalFrames = Math.max(1, Math.ceil(duration * fps));
  const cards = resolvedCards(project);

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
    abortIfNeeded(signal);
    const time = frameIndex / fps;
    renderProjectFrame(ctx, project, time, { width, height, images, bakedImages, cards });
    const timestamp = Math.round((frameIndex / fps) * 1_000_000);
    const frame = new VideoFrame(canvas, {
      timestamp,
      duration: Math.round(1_000_000 / fps),
    });
    encoder.encode(frame, { keyFrame: frameIndex % Math.max(1, fps * 2) === 0 });
    frame.close();
    await waitForQueue(encoder);
    if (frameIndex % Math.max(1, Math.floor(fps / 2)) === 0) {
      onProgress?.(0.04 + 0.72 * (frameIndex / totalFrames), `Rendering frame ${frameIndex + 1} of ${totalFrames}`);
      await delay(0);
    }
  }

  await encoder.flush();
  encoder.close();
  if (encoderError) throw encoderError;
  abortIfNeeded(signal);

  if (mixedAudio) await encodeAudio(mixedAudio, muxer, signal, onProgress);
  onProgress?.(0.98, 'Finalizing MP4');
  muxer.finalize();
  const blob = new Blob([target.buffer], { type: 'video/mp4' });
  downloadBlob(blob, `${sanitizeFilename(filename, 'cts-comparison')}.mp4`);
  onProgress?.(1, 'Export complete');
  return blob;
}
