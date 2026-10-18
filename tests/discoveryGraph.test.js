const test = require('node:test');
const assert = require('node:assert/strict');
const { discoveryProperties } = require('../src/discoveryProjection');
const { executeResearchTool } = require('../src/researchTools');
const { advanceState, newState } = require('../src/researchRunner');
const album = { id:'album', kind:'ReleaseGroup', label:'Album' };
const artist = { id:'artist', kind:'Artist', label:'Same name' };
test('Browse preserves search relevance ahead of billing-credit degree', async (t) => {
  const store = require('../src/graphStore');
  t.mock.method(store, 'searchEntities', async () => [
    {id:'artist',labels:['Artist'],properties:{name:'Artist name'},degree:2},
    {id:'billing',labels:['ArtistCredit'],properties:{name:'Artist name'},degree:100}
  ]);
  const results = await require('../src/graphDemoRepository').searchGraphSeeds('Artist name', 8);
  assert.deepEqual(results.map(row => row.id), ['artist','billing']);
});
test('assertions become qualified connections, preserving parallel claims, zero and exclusions', async () => {
  const { toDiscoveryGraph, confidenceLabel, safeSourceUrl } = await import('../ui/src/graph-demos/discoveryGraph.mjs');
  const claims = [0,65].map((score,i) => ({id:`claim${i}`,kind:'EvidenceAssertion',label:'Claim',properties:{subjectId:'album',factorId:'artist',confidenceScore:score,scope:'album-credit',mode:i?'exclude':'add',excerpt:'Side A only'}}));
  const graph = toDiscoveryGraph({nodes:[album,artist,{...artist,id:'different'},...claims],edges:[]});
  assert.equal(graph.nodes.length,3);
  assert.equal(graph.edges.length,2);
  assert.equal(graph.edges[0].properties.confidenceScore,0);
  assert.equal(graph.edges[1].properties.mode,'exclude');
  assert.match(confidenceLabel(0), /unsupported/);
  assert.match(confidenceLabel(65), /tentative/);
  assert.equal(confidenceLabel(null),'Unassessed');
  assert.equal(safeSourceUrl('javascript:alert(1)'),null);
  assert.equal(safeSourceUrl('https://example.com'), 'https://example.com/');
});
test('incomplete assertions stay visible and dangling edges are excluded', async () => {
  const { toDiscoveryGraph, layoutDiscovery } = await import('../ui/src/graph-demos/discoveryGraph.mjs');
  const result = toDiscoveryGraph({nodes:[album,{id:'claim',label:'claim',kind:'EvidenceAssertion',properties:{subjectId:'album',factorId:'absent'}}],edges:[{id:'bad',source:'album',target:'missing'}]});
  assert.equal(result.nodes.length,2); assert.equal(result.edges.length,0);
  const layout = layoutDiscovery(result.nodes,290);
  for (const p of layout.positions.values()) { assert.ok(p.x-p.width/2>=0); assert.ok(p.x+p.width/2<=290); }
});
test('public projection excludes provider bodies and arbitrary/private data', () => {
  assert.deepEqual(discoveryProperties({confidenceScore:0,rawProvider:'huge',listens:[1],token:'secret',scope:'direct'}),{scope:'direct',confidenceScore:0});
});
test('presentation validates public identities and bounds before retrieving relationships', async () => {
  await assert.rejects(executeResearchTool('graph',{action:'present',nodeIds:Array(31).fill('x'),title:'X'}), /1-30/);
  await assert.rejects(executeResearchTool('graph',{action:'present',nodeIds:['public','private'],title:'X'}, {db:{$queryRaw:async () => [{id:'public'}]}}), /public node/);
  const replies = [[{id:'album',kind:'ReleaseGroup',name:'Album'},{id:'artist',kind:'Artist',name:'Artist'}],
    [{id:'claim'}],
    [{id:'claim',kind:'EvidenceAssertion',name:'Claim',properties:{subjectId:'album',factorId:'artist',confidenceScore:65,sourceUrl:'https://example.com',scope:'album-credit'}}],
    [{id:'rel',sourceId:'album',targetId:'artist',type:'Credit',providerTypeName:'producer'}]];
  const sql=[];
  const result=await executeResearchTool('graph',{action:'present',nodeIds:['artist','album'],title:'Two artists'}, {db:{$queryRaw:async (query)=>{sql.push((query.strings || query).join('')); return replies.shift();}}});
  assert.equal(result.replaceGraph,true); assert.equal(result.graph.meta.presentation,true);
  assert.equal(result.graph.seedNode.id,'artist'); assert.equal(result.graph.nodes[2].properties.confidenceScore,65);
  assert.match(sql[0], /NOT e.labels/); assert.match(sql[3], /LIMIT 241/); assert.match(sql[1], /LIMIT 61/);
  assert.equal(replies.length,0);
});
test('curated graph replaces exploration clutter and remains during subsequent reads', async () => {
  const state=newState({prompt:'Show connections'}); state.graph={nodes:[{id:'clutter'}],edges:[]};
  const graph={nodes:[album,artist],edges:[],meta:{presentation:true,title:'Album and artist'}};
  const response=action=>({id:'resp',output:[{type:'function_call',name:'graph',call_id:action,arguments:JSON.stringify({action})}]});
  const shown=await advanceState(state,{respond:async()=>response('present'),execute:async()=>({data:{},graph,replaceGraph:true})});
  const later=await advanceState(shown,{respond:async()=>response('node'),execute:async()=>({data:{},graph:{nodes:[{id:'clutter'}],edges:[]}})});
  assert.deepEqual(later.graph,graph);
});
test('seed presentation gathers bounded public factors without a model or recursive traversal', async () => {
  const replies = [[{id:'album',name:'Album',kind:'ReleaseGroup'}],[{id:'artist'}],
    [{id:'album',name:'Album',kind:'ReleaseGroup'},{id:'artist',name:'Artist',kind:'Artist'}],[],[],[]];
  const queries=[];
  const result=await executeResearchTool('graph',{action:'present',id:'album',title:'Album'}, {db:{$queryRaw:async query=>{queries.push((query.strings||query).join(''));return replies.shift();}}});
  assert.deepEqual(result.data.displayedNodeIds,['album','artist']);
  assert.match(queries[1], /LIMIT 30/);
  assert.match(queries[1], /NOT e.labels/);
  assert.doesNotMatch(queries[1], /RECURSIVE/);
});
