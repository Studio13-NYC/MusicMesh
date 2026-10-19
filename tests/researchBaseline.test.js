const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const d=require('../src/domain');
const {sha256}=require('../src/import/history');
const {readSnapshot,planSnapshotRefresh,selectSnapshotDelta}=require('../src/import/graphSnapshot');
const {entityFromGraph,relationshipFromGraph}=require('../src/domain/serialization');

function fixture(t){const root=fs.mkdtempSync(path.join(os.tmpdir(),'musicmesh-baseline-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));return root;}
function writeGraph(dir,nodes,edges,version='1.3.1'){
 fs.mkdirSync(dir,{recursive:true});const files={};
 for(const [file,rows] of [['nodes.ndjson',nodes],['relationships.ndjson',edges]]){const bytes=rows.map(JSON.stringify).join('\n')+'\n';fs.writeFileSync(path.join(dir,file),bytes);files[file]=sha256(bytes);}
 const manifest={version:1,ontologyVersion:version,nodes:nodes.length,relationships:edges.length,files,sourceInput:{sourceHash:'history'}};
 fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify(manifest));return manifest;
}
function research(dir,nodes,edges){
 const manifest=writeGraph(path.join(dir,'catalog-extension'),nodes,edges);
 const packet=JSON.stringify({claims:[]});fs.writeFileSync(path.join(dir,'claims.json'),packet);
 const sourceHash='operator-enrichment:'+sha256(JSON.stringify(manifest.files)+sha256(packet));
 const counts={nodes:nodes.length,relationships:edges.length};
 fs.writeFileSync(path.join(dir,'main-persistence-receipt.json'),JSON.stringify({sourceHash,state:'committed',counts}));
 return {sourceHash,...counts};
}
test('historical snapshot round trips retain stored ontology versions for exact CAS',t=>{
 const dir=fixture(t),a=new d.Recording({id:'r',name:'Recording'}).toGraphNode(),b=new d.Work({id:'w',name:'Work'}).toGraphNode();
 const edge=new d.PerformanceOf({source:entityFromGraph(a),target:entityFromGraph(b),assertionKey:'performance'}).toGraphRelationship();
 for(const row of [a,b,edge])row.properties.ontologyVersion='1.2.0';
 writeGraph(dir,[a,b],[edge],'1.2.0');
 const graph=readSnapshot(dir,{preserveOntologyVersion:true});
 assert.deepEqual(graph.nodes[0].toGraphNode(),a);
 assert.deepEqual(graph.relationships[0].toGraphRelationship(),edge);
 const {storageRow}=require('../src/domain/repository');
 assert.equal(storageRow(graph.nodes[0]).extra.ontologyVersion,'1.2.0');
 assert.throws(()=>entityFromGraph({...a,properties:{...a.properties,ontologyVersion:'99.0.0'}}),/ontology version/i);
 assert.throws(()=>relationshipFromGraph({...edge,properties:{...edge.properties,ontologyVersion:'99.0.0'}},new Map(graph.nodes.map(n=>[n.id,n]))),/ontology version/i);
});
test('verified research supplies CAS baselines for later catalog hydration and retains omitted research',async t=>{
 const {extendResearchBaseline}=require('../src/import/researchBaseline');
 const root=fixture(t),a=new d.Recording({id:'r',name:'Recording'}),w=new d.Work({id:'w',name:'Embedded work'}),keep=new d.Technique({id:'technique',name:'Research technique'});
 const edge=new d.PerformanceOf({source:a,target:w,assertionKey:'performance'});
 const batch=research(root,[w.toGraphNode(),keep.toGraphNode()],[edge.toGraphRelationship()]);
 const previous={manifest:{sourceInput:{sourceHash:'history'}},nodes:[a],relationships:[]};
 const db={importBatch:{findUnique:async({where})=>where.sourceHash===batch.sourceHash?batch:null}};
 const baseline=await extendResearchBaseline(previous,{directories:[root],db});
 const next={manifest:previous.manifest,nodes:[a,new d.Work({id:'w',name:'Hydrated work'})],relationships:[edge]};
 const plan=planSnapshotRefresh(baseline,next),selected=selectSnapshotDelta(baseline,next,plan);
 assert.equal(plan.nodes.get('w').name,'Embedded work');
 assert.equal(plan.summary.retainedNodes,1);
 assert.deepEqual(selected.nodes.map(n=>n.id),['w']);
 assert.equal(selected.carriedRelationships,1);
 assert.equal(previous.nodes.length,1,'does not mutate the original snapshot');
 await assert.rejects(()=>extendResearchBaseline(previous,{directories:[root],db:{importBatch:{findUnique:async()=>null}}}),/verified research import/i);
 fs.appendFileSync(path.join(root,'catalog-extension','nodes.ndjson'),' ');
 await assert.rejects(()=>extendResearchBaseline(previous,{directories:[root],db}),/checksum/i);
});
test('research baseline refuses conflicting identities instead of overriding an existing baseline',async t=>{
 const {extendResearchBaseline}=require('../src/import/researchBaseline');
 const root=fixture(t),original=new d.Work({id:'w',name:'Original'});
 const batch=research(root,[new d.Work({id:'w',name:'Conflicting'}).toGraphNode()],[]);
 await assert.rejects(()=>extendResearchBaseline({manifest:{},nodes:[original],relationships:[]},{directories:[root],db:{importBatch:{findUnique:async()=>batch}}}),/conflicting research baseline/i);
});
test('final snapshot preserves exact research records and includes research-only catalog paths',t=>{
 const {preserveResearchSnapshot}=require('../src/import/researchBaseline');
 const root=fixture(t),source=path.join(root,'source'),researchDir=path.join(root,'research'),output=path.join(root,'final');
 const a=new d.Recording({id:'r',name:'Recording'}),embedded=new d.Work({id:'w',name:'Brief work',properties:{hydrationStatus:'embedded'}});
 const detailed=new d.Work({id:'w',name:'Researched work',ontologyVersion:'1.3.0',properties:{hydrationStatus:'lookup',annotation:'Keep the research'}});
 const retained=new d.Technique({id:'technique',name:'Research only'}),edge=new d.PerformanceOf({source:a,target:detailed,assertionKey:'performance'});
 writeGraph(source,[a.toGraphNode(),embedded.toGraphNode()],[]);
 research(researchDir,[detailed.toGraphNode(),retained.toGraphNode()],[edge.toGraphRelationship()]);
 const manifest=preserveResearchSnapshot({directory:source,outputDir:output,researchDirectories:[researchDir]});
 const graph=readSnapshot(output,{preserveOntologyVersion:true});
 assert.equal(manifest.nodes,3);assert.equal(manifest.relationships,1);
 assert.deepEqual(graph.nodes.find(n=>n.id==='w').toGraphNode(),detailed.toGraphNode());
 assert.equal(graph.nodes.find(n=>n.id==='technique').name,'Research only');
 assert.equal(manifest.researchBaselines.length,1);
 assert.equal(readSnapshot(source).nodes.find(n=>n.id==='w').name,'Brief work','original compiled source stays unchanged');
});
