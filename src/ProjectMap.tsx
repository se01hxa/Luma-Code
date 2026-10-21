import { useEffect, useMemo, useState } from 'react';
import { ReactFlow, Background, Controls, MiniMap, Handle, Position, MarkerType, type Node, type Edge, type NodeProps, type NodeTypes } from '@xyflow/react';
import dagre from '@dagrejs/dagre';
import { Network, FolderTree, RefreshCw, Search, Folder, ArrowUpRight, Box, Route, Shapes } from 'lucide-react';
import '@xyflow/react/dist/style.css';
import type { Entry, GraphData, Workspace } from './types';
import { FileIcon, IconButton, Spinner } from './components';

type MapNode = Node<{ label: string; path: string; directory: boolean; symbols: { name: string; kind: string; line: number }[]; count?: number; onOpen: (p: string, line?: number) => void }, 'module'>;
function ModuleNode({ data }: NodeProps<MapNode>) {
  return <div className={`map-node ${data.directory ? 'directory-node' : ''}`}><Handle type="target" position={Position.Left}/><button className="map-node-title" onClick={() => !data.directory && data.onOpen(data.path)} title={data.path}>{data.directory ? <Folder size={16}/> : <FileIcon path={data.path} size={16}/>}<b>{data.label}</b>{data.directory ? <span className="node-count">{data.count}</span> : <ArrowUpRight size={13} className="node-arrow"/>}</button><div className="node-path" title={data.path}>{data.path.includes('/') ? data.path.slice(0, data.path.lastIndexOf('/')) : '프로젝트 루트'}</div>{data.symbols.length > 0 && <div className="node-symbols">{data.symbols.slice(0, 3).map((symbol, i) => <button key={i} onClick={() => data.onOpen(data.path, symbol.line)} title={`${symbol.kind} · ${symbol.name}`}><span>{symbol.kind === 'class' ? 'C' : symbol.kind === 'interface' ? 'I' : 'ƒ'}</span>{symbol.name}</button>)}{data.symbols.length > 3 && <span className="muted more-symbols">+ {data.symbols.length - 3}개 심볼</span>}</div>}<Handle type="source" position={Position.Right}/></div>;
}
const nodeTypes: NodeTypes = { module: ModuleNode };
function fileCount(tree: Entry[]): number { return tree.reduce((n, e) => n + (e.kind === 'file' ? 1 : fileCount(e.children || [])), 0); }

export default function ProjectMap({ workspace, onOpen, revision }: { workspace: Workspace; onOpen: (p: string, line?: number) => void; revision: number }) {
  const [data, setData] = useState<GraphData>(), [error, setError] = useState(''), [loading, setLoading] = useState(true), [mode, setMode] = useState('folders'), [query, setQuery] = useState(''), [generation, setGeneration] = useState(0);
  useEffect(() => { let cancelled = false; setLoading(true); setError(''); window.luma.graph().then(d => { if (!cancelled) setData(d); }).catch(e => { if (!cancelled) setError(e.message); }).finally(() => { if (!cancelled) setLoading(false); }); return () => { cancelled = true; }; }, [workspace.root, workspace.host, revision, generation]);
  const { nodes, edges, capped } = useMemo(() => {
    if (!data) return { nodes: [], edges: [], capped: false };
    const nodes: MapNode[] = [], edges: Edge[] = [], selected = new Set<string>();
    const matching = data.modules.filter(m => !query || m.path.toLowerCase().includes(query.toLowerCase()) || m.symbols.some(s => s.name.toLowerCase().includes(query.toLowerCase())));
    if (mode === 'dependencies') {
      matching.slice(0, 160).forEach(m => { selected.add(m.path); nodes.push({ id: m.path, type: 'module', position: { x: 0, y: 0 }, data: { label: m.path.split('/').pop()!, path: m.path, directory: false, symbols: m.symbols, onOpen } }); });
      data.edges.filter(e => selected.has(e.source) && selected.has(e.target)).forEach((e, i) => edges.push({ id: `e${i}`, source: e.source, target: e.target, type: 'smoothstep', markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 }, style: { stroke: 'var(--accent)', opacity: .45, strokeWidth: 1.4 } }));
    } else {
      const symbolMap = new Map(data.modules.map(m => [m.path, m.symbols]));
      const walk = (tree: Entry[], parent?: string) => {
        for (const item of tree) {
          if (nodes.length >= 180) break;
          const hasMatch = (entry: Entry): boolean => entry.path.toLowerCase().includes(query.toLowerCase()) || symbolMap.get(entry.path)?.some(s => s.name.toLowerCase().includes(query.toLowerCase())) || !!entry.children?.some(hasMatch);
          if (query && !hasMatch(item)) continue;
          nodes.push({ id: item.path, type: 'module', position: { x: 0, y: 0 }, data: { label: item.name, path: item.path, directory: item.kind === 'directory', symbols: item.kind === 'file' ? symbolMap.get(item.path) || [] : [], count: item.kind === 'directory' ? fileCount(item.children || []) : undefined, onOpen } });
          if (parent) edges.push({ id: `${parent}>${item.path}`, source: parent, target: item.path, type: 'smoothstep', style: { stroke: 'var(--map-edge)', strokeWidth: 1.2 } });
          if (item.children) walk(item.children, item.path);
        }
      };
      nodes.push({ id: '__root__', type: 'module', position: { x: 0, y: 0 }, data: { label: workspace.name, path: workspace.name, directory: true, symbols: [], count: fileCount(workspace.tree), onOpen } });
      walk(workspace.tree, '__root__');
    }
    const graph = new dagre.graphlib.Graph(); graph.setGraph({ rankdir: 'LR', nodesep: 20, ranksep: 100, marginx: 60, marginy: 60 }); graph.setDefaultEdgeLabel(() => ({}));
    nodes.forEach(n => graph.setNode(n.id, { width: 236, height: 70 + Math.min(3, n.data.symbols.length) * 24 + (n.data.symbols.length > 3 ? 23 : 0) }));
    edges.forEach(e => graph.setEdge(e.source, e.target)); dagre.layout(graph);
    nodes.forEach(n => { const p = graph.node(n.id); n.position = { x: p.x - 118, y: p.y - p.height / 2 }; });
    return { nodes, edges, capped: mode === 'dependencies' ? matching.length > 160 : nodes.length >= 180 };
  }, [data, mode, query, workspace.tree, onOpen]);
  return <div className="project-map"><div className="map-header"><div><span className="eyebrow">PROJECT AT A GLANCE</span><h1>프로젝트 구조 <span className="pill">{workspace.name}</span></h1><p>흐름을 파악하고, 원하는 코드로 바로 이동하세요.</p></div><div className="map-stats"><span><Box size={15}/><b>{data?.modules.length ?? '—'}</b> 코드 파일</span><span><Route size={15}/><b>{data?.edges.length ?? '—'}</b> 의존 관계</span><span><Shapes size={15}/><b>{data?.modules.reduce((n, m) => n + m.symbols.length, 0) ?? '—'}</b> 심볼</span></div></div>
    <div className="map-toolbar"><div className="segmented"><button className={mode === 'folders' ? 'active' : ''} onClick={() => setMode('folders')}><FolderTree size={14}/> 폴더 구조</button><button className={mode === 'dependencies' ? 'active' : ''} onClick={() => setMode('dependencies')}><Network size={14}/> 의존 관계</button></div><label className="map-search"><Search size={14}/><input aria-label="구조도 검색" placeholder="파일 또는 심볼 검색…" value={query} onChange={e => setQuery(e.target.value)}/></label><IconButton title="구조도 새로 고침" onClick={() => setGeneration(n => n + 1)}><RefreshCw size={15} className={loading ? 'spin' : ''}/></IconButton></div>
    <div className="map-canvas">{loading ? <Spinner label="코드 구조를 분석하고 있습니다…"/> : error ? <div className="map-empty">{error}<button className="text-button" onClick={() => setGeneration(n => n + 1)}>다시 시도</button></div> : nodes.length ? <ReactFlow key={`${mode}-${query}-${generation}-${revision}`} nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: .15, maxZoom: 1 }} minZoom={.08} maxZoom={1.5} nodesDraggable={false} nodesConnectable={false} proOptions={{ hideAttribution: true }} colorMode="dark"><Background color="var(--map-dot)" gap={22} size={1}/><Controls showInteractive={false}/><MiniMap nodeColor={n => (n as MapNode).data.directory ? '#6f7884' : '#86b6ac'} maskColor="var(--map-mask)" pannable zoomable/></ReactFlow> : <div className="map-empty">일치하는 코드 파일이 없습니다.</div>}</div>
    <div className="map-legend"><span><i className="legend-line"/>{mode === 'folders' ? '폴더 · 파일의 포함 관계' : '가져오는 파일 → 참조되는 파일'}</span><span>파일 이름 · 심볼 클릭으로 이동 · 드래그로 화면 이동</span>{(capped || data?.truncated) && <span className="warning-text">일부 파일만 표시됩니다. 검색으로 범위를 좁혀주세요.</span>}</div>
  </div>;
}
