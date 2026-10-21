import { monaco } from './editor';
import { playSound } from './sounds';
import type { Theme } from './types';

let cancelCurrent: (() => void) | undefined;
export function finishReveal() { cancelCurrent?.(); }

/** Reveal the real model through decorations; its text, undo history and dirty state never change. */
export function revealCode(editor: monaco.editor.IStandaloneCodeEditor, host: HTMLElement, theme: Theme) {
  finishReveal();
  const model = editor.getModel();
  if (!model || !model.getValueLength() || !theme.openAnimation || matchMedia('(prefers-reduced-motion: reduce)').matches) return () => {};
  const end = model.getPositionAt(model.getValueLength());
  const visibleEnd = Math.min(model.getLineCount(), (editor.getVisibleRanges().at(-1)?.endLineNumber || 36) + 1);
  const length = Math.max(1, model.getOffsetAt({ lineNumber: visibleEnd, column: model.getLineMaxColumn(visibleEnd) }));
  const decoration = editor.createDecorationsCollection();
  const duration = Math.min(2400, Math.max(300, theme.animationDuration));
  let raf = 0, stopped = false, start = performance.now(), previous = -1;
  host.dataset.revealing = 'true'; host.style.setProperty('--reveal-progress', '0%');
  editor.updateOptions({ minimap: { enabled: false }, stickyScroll: { enabled: false } });
  const finish = () => {
    if (stopped) return; stopped = true; cancelAnimationFrame(raf); decoration.clear();
    delete host.dataset.revealing; host.style.removeProperty('--reveal-progress');
    if (editor.getModel() === model && !model.isDisposed()) editor.updateOptions({ minimap: { enabled: theme.minimap }, stickyScroll: { enabled: true } });
    host.removeEventListener('pointerdown', finish, true); host.removeEventListener('wheel', finish, true); host.removeEventListener('keydown', finish, true);
    document.removeEventListener('visibilitychange', finish); content.dispose();
    if (cancelCurrent === finish) cancelCurrent = undefined;
  };
  const content = editor.onDidChangeModelContent(finish);
  const frame = (now: number) => {
    if (stopped) return;
    if (editor.getModel() !== model || model.isDisposed() || document.hidden) { finish(); return; }
    const progress = Math.min(1, (now - start) / duration), offset = Math.floor(length * (1 - Math.pow(1 - progress, 1.45)));
    if (offset !== previous) {
      const p = model.getPositionAt(offset);
      decoration.set([
        { range: new monaco.Range(p.lineNumber, p.column, end.lineNumber, end.column), options: { inlineClassName: 'code-reveal-hidden', stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges } },
        { range: new monaco.Range(p.lineNumber, p.column, p.lineNumber, p.column), options: { afterContentClassName: 'code-reveal-caret', showIfCollapsed: true } },
      ]);
      host.style.setProperty('--reveal-progress', `${Math.round(progress * 100)}%`);
      if (previous >= 0) void playSound('reveal'); previous = offset;
    }
    if (progress >= 1) finish(); else raf = requestAnimationFrame(frame);
  };
  cancelCurrent = finish;
  host.addEventListener('pointerdown', finish, true); host.addEventListener('wheel', finish, { capture: true, passive: true }); host.addEventListener('keydown', finish, true);
  document.addEventListener('visibilitychange', finish);
  frame(start); return finish;
}
