export function safeSourceUrl(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; }
  catch { return null; }
}
export function catalogUrl(id) {
  const parts = String(id).split(':');
  return parts.length === 3 && parts[0] === 'musicbrainz' &&
    ['artist','recording','release','release-group','work','place','instrument','label','area'].includes(parts[1]) &&
    /^[a-f0-9-]{36}$/.test(parts[2]) ? `https://musicbrainz.org/${parts[1]}/${parts[2]}` : null;
}
export function confidenceLabel(score) {
  if (!Number.isInteger(score) || score < 0 || score > 100) return 'Unassessed';
  return `${score}/100 · ${score === 0 ? 'currently unsupported' : score < 70 ? 'tentative' : score < 90 ? 'stronger support' : 'very strong support'}`;
}
export function connectionCategory(edge) {
  const role = edge.properties?.role || edge.label || edge.type || '';
  if (/studio|produc|recorded|engineer|mix|master/i.test(role)) return 'production';
  if (/instrument|equipment|technique/i.test(role)) return 'sound';
  return 'people';
}
export function toDiscoveryGraph(graph) {
  const all = graph.nodes || [], ids = new Set(all.map(n => n.id));
  // This is a presentation of an assertion, not a new canonical relationship.
  const collapsed = all.filter(n => n.kind === 'EvidenceAssertion' &&
    ids.has(n.properties?.subjectId) && ids.has(n.properties?.factorId));
  const hidden = new Set(collapsed.map(n => n.id));
  const nodes = all.filter(n => !hidden.has(n.id));
  const visible = new Set(nodes.map(n => n.id));
  const edges = (graph.edges || []).filter(e => visible.has(e.source) && visible.has(e.target));
  for (const claim of collapsed) edges.push({ id: `assertion:${claim.id}`, assertionId: claim.id,
    source: claim.properties.subjectId, target: claim.properties.factorId,
    type: 'EvidenceAssertion', label: claim.properties.role, properties: claim.properties });
  const order = graph.meta?.nodeOrder || [];
  const rank = new Map(order.map((id,i) => [id,i]));
  nodes.sort((a,b) => (rank.get(a.id) ?? 1000) - (rank.get(b.id) ?? 1000) ||
    Number(b.id === graph.seedNode?.id) - Number(a.id === graph.seedNode?.id) ||
    a.label.localeCompare(b.label) || a.id.localeCompare(b.id));
  return { nodes, edges, meta: graph.meta || {}, seedNode: graph.seedNode };
}
export function layoutDiscovery(nodes, width) {
  const columns = width < 470 ? 2 : 3;
  return { height: Math.max(280, Math.ceil(nodes.length / columns) * 108 + 30),
    positions: new Map(nodes.map((n,i) => [n.id, {
      x: (i % columns + .5) * width / columns, y: 65 + Math.floor(i / columns) * 108,
      width: Math.min(188, width / columns - 20)
    }])) };
}
