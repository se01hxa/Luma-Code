export type SoundKind = 'tock' | 'click' | 'soft' | 'success' | 'error' | 'open' | 'reveal';
export const SOUND_NAMES: Record<SoundKind, string> = {
  tock: '또각 · 나무 키캡', click: '톡 · 가벼운 클릭', soft: '보송 · 부드러운 터치',
  success: '성공 · 맑은 세 음', error: '오류 · 낮은 두 음', open: '열기 · 짧은 반짝임', reveal: '차라락 · 타이핑',
};
const LENGTH: Record<SoundKind, number> = { tock: .115, click: .065, soft: .10, success: .42, error: .32, open: .22, reveal: .045 };

/** Original, deterministic sound designs, shared by the live player and WAV exports. */
export function synthesizeSound(kind: SoundKind, sampleRate = 44100, variant = 0): Float32Array {
  const samples = new Float32Array(Math.ceil(sampleRate * LENGTH[kind]));
  let seed = 17321 + variant * 7919, previousNoise = 0;
  const noise = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2147483648 - 1; };
  const pluck = (t: number, hz: number, decay: number, start = 0) => {
    const age = t - start;
    return age < 0 ? 0 : Math.sin(2 * Math.PI * hz * age) * Math.min(age / .0012, 1) * Math.exp(-age / decay);
  };
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate, n = noise(); let value = 0;
    if (kind === 'tock') value = .52 * pluck(t, 760, .014) + .22 * pluck(t, 1830, .009) + .11 * pluck(t, 440, .022, .027) + .13 * (n - previousNoise) * Math.exp(-t / .004);
    else if (kind === 'click') value = .28 * pluck(t, 1750, .009) + .14 * n * Math.exp(-t / .005);
    else if (kind === 'soft') value = .30 * pluck(t, 620, .021) + .09 * pluck(t, 1240, .012);
    else if (kind === 'success') value = .29 * pluck(t, 659.25, .062) + .29 * pluck(t, 830.61, .069, .085) + .32 * pluck(t, 1108.73, .083, .17);
    else if (kind === 'error') value = .35 * pluck(t, 246.94, .055) + .12 * pluck(t, 493.88, .028) + .33 * pluck(t, 196, .065, .12) + .10 * pluck(t, 392, .03, .12);
    else if (kind === 'open') value = .21 * pluck(t, 740, .037) + .18 * pluck(t, 1174.66, .05, .047);
    else value = .26 * pluck(t, 1150 + variant * 83, .006) + .10 * n * Math.exp(-t / .003);
    const fade = Math.min(i / (sampleRate * .0005), 1, (samples.length - 1 - i) / (sampleRate * .004));
    samples[i] = Math.tanh(value) * Math.max(0, fade); previousNoise = n;
  }
  return samples;
}
