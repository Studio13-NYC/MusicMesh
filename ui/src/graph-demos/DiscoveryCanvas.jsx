import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { catalogUrl, confidenceLabel, connectionCategory, layoutDiscovery, safeSourceUrl, toDiscoveryGraph } from './discoveryGraph.mjs';
import './discovery.css';

export const DiscoveryCanvas = forwardRef(function DiscoveryCanvas({ graph, selectedElement, onSelectElement, onExpandNode, selectedConnectionId, onSelectConnection }, ref) {
  const data = useMemo(() => toDiscoveryGraph(graph), [graph]);
  const stage = useRef(null), scroll = useRef(null);
  const [width, setWidth] = useState(700);
  const edgeId = selectedConnectionId, setEdgeId = onSelectConnection;
  const [focusId, setFocusId] = useState(null);
  const selectedId = selectedElement?.type === 'node' ? selectedElement.id : focusId;
  const selected = data.nodes.find(n => n.id === selectedId) || data.nodes.find(n => n.id === graph.seedNode?.id) || data.nodes[0];
  const connections = data.edges.filter(e => e.source === selected?.id || e.target === selected?.id);
  const edge = connections.find(e => e.id === edgeId);
  const neighbors = new Set([selected?.id, ...connections.flatMap(e => [e.source,e.target])]);
  const layout = useMemo(() => layoutDiscovery(data.nodes, width), [data.nodes,width]);
  const nodeById = new Map(data.nodes.map(n => [n.id,n]));
  useEffect(() => {
    const observer = new ResizeObserver(entries => setWidth(Math.max(200, entries[0].contentRect.width)));
    observer.observe(stage.current); return () => observer.disconnect();
  }, []);
  useImperativeHandle(ref, () => ({ fitToGraph() { scroll.current?.scrollTo({top:0}); },
    resetView() { setEdgeId(null); setFocusId(null); onSelectElement(null); scroll.current?.scrollTo({top:0}); } }));
  function chooseNode(id) { setFocusId(id); setEdgeId(null); onSelectElement({type:'node', id}); }
  function chooseEdge(e) { if (!connections.some(c => c.id === e.id)) { setFocusId(e.source); onSelectElement({type:'node',id:e.source}); } setEdgeId(e.id); }
  const p = edge?.properties || {};
  const source = safeSourceUrl(p.sourceUrl);
  const definition = safeSourceUrl(p.definitionUrl || edge?.summary?.definitionUrl);
  return <section className="discovery" aria-label="Interactive discovery graph" ref={scroll}>
    <header className="discovery-heading"><h2>{graph.meta?.title || `${graph.seedNode?.label || 'Music'}: connections`}</h2>
      <p>Select a node, then a connection. Double-click a node to explore further.</p>
      <div className="discovery-legend"><span className="people">People / repertoire</span><span className="production">Production / studios</span><span className="sound">Instruments / methods</span></div>
      <p className="discovery-coverage">{data.nodes.length} nodes · {data.edges.length} connections · bounded catalog view{graph.meta?.truncated ? ' · more evidence is available' : ''}</p>
    </header>
    <div className="discovery-layout">
      <div ref={stage} className="discovery-stage" style={{height:layout.height}} role="group" aria-label="Music connections">
        <svg className="discovery-lines" width="100%" height={layout.height} aria-label="Connections between music entities">
          {data.edges.map((e,i) => {
            const a = layout.positions.get(e.source), b = layout.positions.get(e.target);
            if (!a || !b) return null;
            const bend = 25 + i % 5 * 12;
            const d = a.x === b.x ? `M${a.x},${a.y} C${Math.min(width-5,a.x+bend+80)},${a.y} ${Math.min(width-5,b.x+bend+80)},${b.y} ${b.x},${b.y}` :
              `M${a.x},${a.y} C${a.x},${a.y+(b.y-a.y)/2+bend} ${b.x},${b.y-(b.y-a.y)/2-bend} ${b.x},${b.y}`;
            const active = e.source === selected?.id || e.target === selected?.id;
            return <g key={e.id} className={`discovery-edge ${connectionCategory(e)}${active ? ' active' : ''}${edge?.id === e.id ? ' chosen' : ''}`}>
              <path d={d} className="discovery-edge-line"/>
              <path d={d} className="discovery-edge-hit" onClick={() => chooseEdge(e)}><title>{`${nodeById.get(e.source)?.label} → ${nodeById.get(e.target)?.label}: ${e.label || e.type}`}</title></path>
            </g>;
          })}
        </svg>
        {data.nodes.map(n => { const pos = layout.positions.get(n.id); return <button type="button" key={n.id}
          className={`discovery-node${n.id === selected?.id ? ' selected' : ''}${neighbors.has(n.id) ? '' : ' dimmed'}`}
          style={{left:pos.x,top:pos.y,width:pos.width}} aria-pressed={n.id === selected?.id}
          title={`${n.label} · ${n.kind}`} onClick={() => chooseNode(n.id)} onDoubleClick={() => onExpandNode(n.id)}>
          <strong>{n.label}</strong><span>{n.kind}</span></button>; })}
      </div>
      <aside className="discovery-inspector" aria-label="Connection inspector">
        <h3>{selected?.label}</h3><p className="discovery-muted">{selected?.kind}</p>
        <button className="demo-button" type="button" onClick={() => onExpandNode(selected.id)}>Explore {selected?.label}</button>
        <div className="discovery-connections" aria-label={`Connections for ${selected?.label}`}>
          {connections.length ? connections.map(e => <button type="button" key={e.id} aria-pressed={e.id === edge?.id}
            className={connectionCategory(e)} onClick={() => chooseEdge(e)}>
            <strong>{nodeById.get(e.source === selected.id ? e.target : e.source)?.label}</strong>
            <span>{e.label || e.type}</span>
          </button>) : <p>No connections in this view. Explore this node to retrieve more.</p>}
        </div>
        {edge ? <div className="discovery-evidence" aria-live="polite">
          <h4>{nodeById.get(edge.source)?.label} → {nodeById.get(edge.target)?.label}</h4>
          <dl><dt>Connection</dt><dd>{edge.label || edge.type}</dd>
            <dt>Scope</dt><dd>{p.scope || 'This catalog relationship only; no automatic album or track inheritance.'}{p.mode ? ` · ${p.mode}` : ''}</dd>
            {p.excerpt ? <><dt>{p.evidenceKind === 'quote' ? 'Source excerpt' : 'Evidence summary'}</dt><dd>{p.excerpt}</dd></> : null}
            <dt>Confidence</dt><dd>{confidenceLabel(p.confidenceScore)}{p.confidenceReason && <p>{p.confidenceReason}</p>}</dd>
            {p.attributes?.length ? <><dt>Attributes</dt><dd>{p.attributes.map(a => typeof a === 'string' ? a : a.type || a.name || '').filter(Boolean).join(', ')}</dd></> : null}
            <dt>Database</dt><dd>{edge.assertionId ? 'Saved assertion shown as a connection' : 'Saved relationship'}</dd>
            <dt>Source</dt><dd>{source ? <a href={source} target="_blank" rel="noreferrer">Open evidence source ↗</a> : <>
              {[edge.source,edge.target].filter(id => catalogUrl(id)).map(id => <a key={id} href={catalogUrl(id)} target="_blank" rel="noreferrer">{nodeById.get(id)?.label} on MusicBrainz ↗<br/></a>)}
              {!catalogUrl(edge.source) && !catalogUrl(edge.target) ? 'No source URL in this projection.' : null}</>}
              {definition && <a href={definition} target="_blank" rel="noreferrer">Relationship definition ↗</a>}</dd>
            {p.overridesAssertionId && <><dt>Overrides</dt><dd>{p.overridesAssertionId}</dd></>}
          </dl><details><summary>Stored identity</summary><code>{edge.assertionId || edge.id}</code></details>
        </div> : <p className="discovery-muted">Choose a connection to see its evidence and scope.</p>}
      </aside>
    </div>
  </section>;
});
