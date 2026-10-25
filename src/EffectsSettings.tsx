import { useEffect, useRef, useState } from 'react';
import { AudioLines, Check, Play, RotateCcw, Sparkles, Volume2, VolumeX } from 'lucide-react';
import type { Theme } from './types';
import { playSound } from './sounds';
import { SOUND_NAMES, type SoundKind } from './sound-design';

const EXAMPLE = '// 아이디어가 코드가 되는 순간.\nconst workspace = {\n  name: "Vexel",\n  ready: true,\n};\n\nfunction welcome(name: string) {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(welcome(workspace.name));';
export default function EffectsSettings({ theme, update }: { theme: Theme; update: (patch: Partial<Theme>) => void }) {
  const [offset, setOffset] = useState(EXAMPLE.length), [animating, setAnimating] = useState(false), frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  const preview = () => {
    cancelAnimationFrame(frame.current); setOffset(0); setAnimating(true); const start = performance.now(); let previous = -1;
    const tick = (time: number) => {
      const progress = Math.min(1, (time - start) / theme.animationDuration), next = Math.floor(EXAMPLE.length * (1 - Math.pow(1 - progress, 1.45)));
      setOffset(next); if (next !== previous) { void playSound('reveal'); previous = next; }
      if (progress < 1) frame.current = requestAnimationFrame(tick); else setAnimating(false);
    };
    frame.current = requestAnimationFrame(tick);
  };
  return <><span className="eyebrow">A LITTLE MORE ALIVE</span><h2>움직임과 작은 울림.</h2><p className="description">새 코드를 여는 순간과 작업의 결과를 기분 좋게 느껴보세요.</p>
    <div className="setting-row"><div><b>코드 열기 애니메이션</b><p>파일을 처음 열면 코드가 차라락 작성되는 효과</p></div><button className={`toggle ${theme.openAnimation ? 'on' : ''}`} role="switch" aria-checked={theme.openAnimation} aria-label="코드 열기 애니메이션" onClick={() => update({ openAnimation: !theme.openAnimation })}><span/></button></div>
    <div className="setting-row"><div><b>펼쳐지는 시간</b><p>클릭·입력·스크롤하면 즉시 전체 코드가 표시됩니다.</p></div><input type="range" aria-label="애니메이션 시간" min="400" max="2200" step="100" value={theme.animationDuration} onChange={e => update({ animationDuration: +e.target.value })}/><code className="range-value">{(theme.animationDuration / 1000).toFixed(1)}s</code></div>
    <div className="effect-preview"><div className="effect-preview-heading"><span><Sparkles size={14}/>CODE REVEAL</span><button className="text-button" data-ui-silent onClick={preview}>{animating ? <RotateCcw size={13}/> : <Play size={13}/>}효과 미리보기</button></div><pre aria-label="코드 효과 미리보기"><code>{EXAMPLE.slice(0, offset)}</code>{animating && <span className="preview-caret"/>}</pre><div className="effect-preview-caption"><Check size={12}/>처음 열 때 한 번만 재생 · 운영체제의 모션 줄이기 설정 적용</div></div>
    <h3>사운드</h3><div className="setting-row"><div><b>효과음 사용</b><p>버튼 클릭·파일 열기·저장·실행 결과에 소리 재생</p></div><button className={`toggle ${theme.soundEnabled ? 'on' : ''}`} role="switch" aria-checked={theme.soundEnabled} aria-label="효과음 사용" onClick={() => update({ soundEnabled: !theme.soundEnabled })}><span/></button></div>
    <div className="setting-row"><div><b>효과음 볼륨</b><p>배경 음악 없이 짧은 효과음만 재생합니다.</p></div>{theme.soundVolume ? <Volume2 size={15} className="muted"/> : <VolumeX size={15} className="muted"/>}<input type="range" aria-label="효과음 볼륨" min="0" max="100" value={theme.soundVolume} onChange={e => update({ soundVolume: +e.target.value })}/><code className="range-value">{theme.soundVolume}%</code></div>
    <div className="setting-row"><div><b>버튼 클릭 소리</b><p>자주 누르는 버튼에 사용할 소리</p></div><select aria-label="버튼 클릭 소리" value={theme.clickSound} onChange={e => { const kind = e.target.value as Theme['clickSound']; update({ clickSound: kind }); void playSound(kind, true); }}>{(['tock', 'click', 'soft'] as const).map(kind => <option key={kind} value={kind}>{SOUND_NAMES[kind]}</option>)}</select></div>
    <div className="setting-row"><div><b>차라락 타이핑 소리</b><p>코드 열기 효과에 작은 키보드 소리 추가</p></div><button className={`toggle ${theme.typingSound ? 'on' : ''}`} role="switch" aria-checked={theme.typingSound} aria-label="차라락 타이핑 소리" onClick={() => update({ typingSound: !theme.typingSound })}><span/></button></div>
    <h3>직접 들어보기</h3><div className="sound-library">{(Object.keys(SOUND_NAMES) as SoundKind[]).map(kind => <button key={kind} data-ui-silent onClick={() => playSound(kind, true)}><AudioLines size={16}/><span>{SOUND_NAMES[kind]}</span><Play size={13}/></button>)}</div><p className="sound-note">각 소리는 이 앱을 위해 직접 제작했습니다. 미리듣기는 효과음 사용 설정과 별도로 재생되며 볼륨 설정을 따릅니다.</p>
  </>;
}
