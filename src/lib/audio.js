const decodedCache = new Map();

export async function decodeAudioSource(audioContext, source) {
  if (!source) return null;
  if (decodedCache.has(source)) return decodedCache.get(source);
  const promise = (async () => {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Could not load audio (${response.status})`);
    const bytes = await response.arrayBuffer();
    return audioContext.decodeAudioData(bytes.slice(0));
  })();
  decodedCache.set(source, promise);
  return promise;
}

function trackEnd(track, buffer) {
  const trimStart = Math.max(0, Number(track.trimStart || 0));
  const requested = Number(track.trimEnd);
  const trimEnd = Number.isFinite(requested) && requested > trimStart
    ? Math.min(requested, buffer.duration)
    : buffer.duration;
  return Math.max(trimStart, trimEnd);
}

export function applyTrackGain(gainNode, track, when, activeDuration, masterVolume = 1) {
  const volume = Math.max(0, Number(track.volume ?? 1)) * Math.max(0, Number(masterVolume ?? 1));
  const fadeIn = Math.min(activeDuration, Math.max(0, Number(track.fadeIn || 0)));
  const fadeOut = Math.min(activeDuration, Math.max(0, Number(track.fadeOut || 0)));
  gainNode.gain.cancelScheduledValues(when);
  if (fadeIn > 0) {
    gainNode.gain.setValueAtTime(0, when);
    gainNode.gain.linearRampToValueAtTime(volume, when + fadeIn);
  } else {
    gainNode.gain.setValueAtTime(volume, when);
  }
  if (fadeOut > 0 && activeDuration > 0) {
    const fadeStart = Math.max(when, when + activeDuration - fadeOut);
    gainNode.gain.setValueAtTime(volume, fadeStart);
    gainNode.gain.linearRampToValueAtTime(0, when + activeDuration);
  }
}

export async function scheduleProjectAudio({
  context,
  destination,
  tracks,
  masterVolume = 1,
  timelineTime = 0,
  timelineDuration,
  startAt = context.currentTime,
}) {
  const sources = [];
  for (const track of tracks) {
    if (!track.src) continue;
    const projectStart = Math.max(0, Number(track.startTime || 0));
    const buffer = await decodeAudioSource(context, track.src);
    if (!buffer) continue;
    const trimStart = Math.max(0, Number(track.trimStart || 0));
    const trimEnd = trackEnd(track, buffer);
    const clipDuration = trimEnd - trimStart;
    if (clipDuration <= 0) continue;
    const elapsedIntoTrack = timelineTime - projectStart;
    if (!track.loop && elapsedIntoTrack >= clipDuration) continue;
    const delay = Math.max(0, projectStart - timelineTime);
    const sourceOffset = elapsedIntoTrack > 0
      ? trimStart + (track.loop ? elapsedIntoTrack % clipDuration : elapsedIntoTrack)
      : trimStart;
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.loop = Boolean(track.loop);
    if (source.loop) {
      source.loopStart = trimStart;
      source.loopEnd = trimEnd;
    }
    const gain = context.createGain();
    source.connect(gain).connect(destination);
    const availableTimeline = Math.max(0, timelineDuration - Math.max(projectStart, timelineTime));
    const activeDuration = track.loop
      ? availableTimeline
      : Math.max(0, Math.min(availableTimeline, trimEnd - sourceOffset));
    if (activeDuration <= 0) continue;
    const when = startAt + delay;
    applyTrackGain(gain, track, when, activeDuration, masterVolume);
    source.start(when, sourceOffset);
    source.stop(when + activeDuration + 0.03);
    sources.push(source);
  }
  return sources;
}

export async function renderOfflineAudio(project, duration, sampleRate = 48_000) {
  const tracks = project.audioTracks.filter((track) => track.src);
  if (!tracks.length) return null;
  const length = Math.max(1, Math.ceil(duration * sampleRate));
  const context = new OfflineAudioContext(2, length, sampleRate);
  await scheduleProjectAudio({
    context,
    destination: context.destination,
    tracks,
    masterVolume: project.settings.soundtrackMasterVolume,
    timelineTime: 0,
    timelineDuration: duration,
    startAt: 0,
  });
  return context.startRendering();
}

export function clearAudioCache() {
  decodedCache.clear();
}
