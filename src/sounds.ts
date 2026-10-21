import { synthesizeSound, type SoundKind } from './sound-design';
import type { Theme } from './types';

let preferences: Pick<Theme, 'soundEnabled' | 'soundVolume' | 'clickSound' | 'typingSound'> = { soundEnabled: true, soundVolume: 35, clickSound: 'tock', typingSound: true };
let context: AudioContext | undefined, variant = 0, lastClick = 0, lastTick = 0;
const buffers = new Map<string, AudioBuffer>();
const playing = new Set<AudioBufferSourceNode>();
export function configureSounds(theme: Theme) {
  preferences = theme;
  if (!theme.soundEnabled || !theme.soundVolume) for (const node of playing) { try { node.stop(); } catch {} }
}
export async function playSound(kind: SoundKind, preview = false) {
  if ((!preview && !preferences.soundEnabled) || !preferences.soundVolume || document.hidden || !navigator.userActivation.hasBeenActive) return;
  if (kind === 'reveal' && !preview && !preferences.typingSound) return;
  const now = performance.now();
  if (kind === 'reveal' && now - lastTick < 42) return;
  if (kind === 'reveal') lastTick = now;
  try {
    context ||= new AudioContext({ latencyHint: 'interactive' });
    if (context.state !== 'running') await context.resume();
    if (context.state !== 'running' || playing.size >= 10) return;
    const v = kind === 'reveal' ? variant++ % 4 : 0, key = `${kind}:${v}`;
    let buffer = buffers.get(key);
    if (!buffer) {
      const wave = synthesizeSound(kind, context.sampleRate, v);
      buffer = context.createBuffer(1, wave.length, context.sampleRate); buffer.getChannelData(0).set(wave); buffers.set(key, buffer);
    }
    const source = context.createBufferSource(), gain = context.createGain(); source.buffer = buffer;
    gain.gain.value = preferences.soundVolume / 100 * (kind === 'reveal' ? .16 : .65);
    source.connect(gain); gain.connect(context.destination); playing.add(source);
    source.onended = () => { playing.delete(source); source.disconnect(); gain.disconnect(); };
    source.start();
  } catch { /* An unavailable or muted audio device must never interrupt editing. */ }
}
export function installButtonSounds() {
  const click = (e: MouseEvent) => {
    const button = (e.target as Element)?.closest('button');
    if (!button || button.disabled || button.closest('[data-ui-silent]') || performance.now() - lastClick < 40) return;
    lastClick = performance.now(); void playSound(preferences.clickSound);
  };
  document.addEventListener('click', click, true);
  return () => document.removeEventListener('click', click, true);
}
