import { useEffect, useRef } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { TerminalInfo, Theme } from './types';

window.luma.onPrivacy(status=>{if(status.changed&&status.active){instances.forEach(term=>{term.reset();term.write('\r\n[토큰 보호가 켜져 이전 출력이 지워졌습니다.]\r\n');});backlog.clear();}});
const instances = new Map<string, Terminal>();
const backlog = new Map<string, string>();
const ended = new Map<string, number>();
window.luma.onTerminal(({ id, data }) => { const term = instances.get(id); if (term) term.write(data); else backlog.set(id, ((backlog.get(id) || '') + data).slice(-300000)); });
window.luma.onTerminalExit(({ id, code }) => { ended.set(id, code); instances.get(id)?.write(`\r\n\x1b[90m[프로세스 종료 · 코드 ${code}]\x1b[0m\r\n`); });
export function clearTerminal(id: string) { instances.get(id)?.clear(); }
export function forgetTerminal(id: string) { backlog.delete(id); ended.delete(id); }

export default function TerminalPanel({ session, active, visible, theme }: { session: TerminalInfo; active: boolean; visible: boolean; theme: Theme }) {
  const el = useRef<HTMLDivElement>(null), terminal = useRef<Terminal>(null), fitter = useRef<FitAddon>(null);
  useEffect(() => {
    const term = new Terminal({ fontFamily: '"Cascadia Code", Consolas, monospace', fontSize: 13, lineHeight: 1.35, cursorBlink: true, cursorStyle: 'bar', scrollback: 5000, allowProposedApi: false, theme: { background: '#00000000', foreground: '#c6cdd9', cursor: theme.accent, selectionBackground: '#758aa040', black: '#1b1e24', red: '#e58e94', green: '#9ccbab', yellow: '#dfc08c', blue: '#82acd8', magenta: '#bd9ade', cyan: '#7bc8c0', white: '#d7dde6', brightBlack: '#77808d', brightRed: '#f4a5aa', brightGreen: '#b7dfc3', brightYellow: '#f1d5a4', brightBlue: '#9ec9f6', brightMagenta: '#d5b9ef', brightCyan: '#9ce2da', brightWhite: '#ffffff' }, allowTransparency: true });
    const fit = new FitAddon(); term.loadAddon(fit); term.open(el.current!); terminal.current = term; fitter.current = fit; instances.set(session.id, term);
    const pending = backlog.get(session.id); if (pending) { term.write(pending); backlog.delete(session.id); }
    if (ended.has(session.id)) term.write(`\r\n\x1b[90m[프로세스 종료 · 코드 ${ended.get(session.id)}]\x1b[0m\r\n`);
    const input = term.onData(data => { void window.luma.terminalWrite(session.id, data); });
    const resize = () => { if (el.current?.offsetWidth) { fit.fit(); void window.luma.terminalResize(session.id, term.cols, term.rows); } };
    const observer = new ResizeObserver(resize); observer.observe(el.current!); resize();
    return () => { observer.disconnect(); input.dispose(); instances.delete(session.id); term.dispose(); };
  }, [session.id]);
  useEffect(() => { if (active && visible) { const timer = setTimeout(() => { fitter.current?.fit(); terminal.current?.focus(); if (terminal.current) void window.luma.terminalResize(session.id, terminal.current.cols, terminal.current.rows); }, 40); return () => clearTimeout(timer); } }, [active, visible]);
  useEffect(() => { if (terminal.current) terminal.current.options.theme = { ...terminal.current.options.theme, foreground: theme.preset === 'paper' ? '#343e40' : '#c6cdd9', cursor: theme.accent }; }, [theme.preset, theme.accent]);
  return <div className="terminal-host" ref={el} style={{ display: active ? 'block' : 'none' }}/ >;
}
