const test=require('node:test');
const assert=require('node:assert/strict');
const {randomUUID}=require('node:crypto');
const {getDatabase,closeDatabase}=require('../src/postgres');
const domain=require('../src/domain');
const store=require('../src/graphStore');
const demo=require('../src/graphDemoRepository');
const {toColumns}=require('../src/graphProperties');
const enabled=process.env.MUSICMESH_TEST_BRAINZ==='isolated';
test.after(closeDatabase);
function isolated(){
  const url=new URL(process.env.DATABASE_URL);
  assert.ok((url.hostname==='ep-flat-glitter-au4xn3l9-pooler.c-10.us-east-1.aws.neon.tech' && url.pathname==='/musicmesh') || (url.hostname==='127.0.0.1' && url.pathname==='/musicmesh_restore'),'Requires the explicitly selected MusicMesh validation target');
  return getDatabase();
}
test('private listens cannot leak through search, degree counts, detail or traversal bridges',{skip:!enabled},async()=>{
  const db=isolated(),prefix='privacy:'+randomUUID(),ids=['public','private','other'].map(x=>prefix+':'+x);
  const rows=ids.map((id,i)=>({id,labels:[i===1?'ListeningEvent':'Recording'],primaryLabel:i===1?'ListeningEvent':'Recording',searchText:prefix,...toColumns({id,name:prefix})}));
  try {
    await db.entity.createMany({data:rows});
    await db.relationship.createMany({data:[{id:prefix+':a',sourceId:ids[0],targetId:ids[1],type:'HasMapping'},{id:prefix+':b',sourceId:ids[1],targetId:ids[2],type:'MapsToRecording'}]});
    const search=await store.searchEntities(prefix,10);
    assert.equal(search.length,2,'private records excluded from every search caller');
    assert.ok(search.every(x=>x.degree===0),'degree must not count private edges');
    assert.equal(await store.detail(ids[1],[],[],10),null);
    await assert.rejects(()=>demo.getNodeDetail(ids[1]),{code:'GRAPH_NODE_NOT_FOUND'});
    assert.equal((await store.detail(ids[0],[],[],10)).relationshipCount,0);
    const graph=await store.neighborhood([ids[0]],{depth:3,pathLimit:100,nodeLimit:100,edgeLimit:100});
    assert.deepEqual(graph.nodes.map(x=>x.id),[ids[0]],'private nodes cannot act as traversal bridges');
    assert.equal(graph.relationships.length,0);
    assert.equal((await store.neighborhood([ids[1]],{depth:2,pathLimit:10,nodeLimit:10,edgeLimit:10})).nodes.length,0);
  } finally {await db.relationship.deleteMany({where:{id:{in:[prefix+':a',prefix+':b']}}});await db.entity.deleteMany({where:{id:{in:ids}}});}
});
test('domain persistence is idempotent, rejects conflicts and rolls back failed relationship batches',{skip:!enabled},async()=>{
  const {persistDomainBatch}=require('../src/domain/repository');
  const db=isolated(),prefix='import-test:'+randomUUID();
  const recording=new domain.Recording({id:prefix+':recording',name:'Recording'}),work=new domain.Work({id:prefix+':work',name:'Work'});
  const relation=new domain.PerformanceOf({source:recording,target:work,assertionKey:prefix});
  const ids=[recording.id,work.id,prefix+':rollback'];
  try {
    await persistDomainBatch(db,{nodes:[recording,work],relationships:[relation]});
    const replay=await persistDomainBatch(db,{nodes:[recording,work],relationships:[relation]});
    assert.equal(replay.createdNodes,0);assert.equal(replay.createdRelationships,0);
    assert.equal(await db.entity.count({where:{id:{in:ids}}}),2);
    const wrongSource=new domain.Artist({id:recording.id,name:'Invented artist endpoint'});
    const wrongTarget=new domain.Artist({id:work.id,name:'Invented artist endpoint'});
    await assert.rejects(()=>persistDomainBatch(db,{relationships:[new domain.MusicBrainzRelationship({source:wrongSource,target:wrongTarget,assertionKey:prefix+':wrong',properties:{providerTypeId:randomUUID(),providerTypeName:'member of band',sourceType:'Artist',targetType:'Artist'}})]}),/endpoint/i);
    await assert.rejects(()=>persistDomainBatch(db,{nodes:[new domain.Recording({id:recording.id,name:'Conflicting name'})],relationships:[]}),/conflict/i);
    const fresh=new domain.Recording({id:ids[2],name:'Rollback'}),missing=new domain.Work({id:prefix+':missing',name:'Missing'});
    await assert.rejects(()=>persistDomainBatch(db,{nodes:[fresh],relationships:[new domain.PerformanceOf({source:fresh,target:missing,assertionKey:prefix})]}));
    assert.equal(await db.entity.findUnique({where:{id:fresh.id}}),null);
  } finally {await db.relationship.deleteMany({where:{sourceId:{in:ids}}});await db.entity.deleteMany({where:{id:{in:ids}}});}
});
test('workbench search and graph retain distinct recordings with identical titles',{skip:!enabled},async()=>{
  const {persistDomainBatch}=require('../src/domain/repository');
  const db=isolated(),prefix='same-title:'+randomUUID();
  const a=new domain.Recording({id:prefix+':a',name:prefix}),b=new domain.Recording({id:prefix+':b',name:prefix}),w=new domain.Work({id:prefix+':w',name:prefix+' work'});
  const edges=[a,b].map(source=>new domain.PerformanceOf({source,target:w,assertionKey:prefix}));
  try {
    await persistDomainBatch(db,{nodes:[a,b,w],relationships:edges});
    const results=await demo.searchGraphSeeds(prefix,10);
    assert.equal(results.filter(x=>x.kind==='Recording').length,2);
    const graph=await demo.fetchSeededGraph(w.id,{depth:1});
    assert.equal(graph.nodes.filter(x=>x.kind==='Recording').length,2);
  } finally {await db.relationship.deleteMany({where:{id:{in:edges.map(e=>e.id)}}});await db.entity.deleteMany({where:{id:{in:[a.id,b.id,w.id]}}});}
});

test('snapshot refresh updates only unchanged baseline records and replays safely',{skip:!enabled},async()=>{
 const {persistDomainBatch}=require('../src/domain/repository');
 const db=isolated(),id='refresh-test:'+randomUUID();
 const old=new domain.Recording({id,name:'Original'}),next=new domain.Recording({id,name:'Enriched'});
 try {
  await persistDomainBatch(db,{nodes:[old]});
  const result=await persistDomainBatch(db,{nodes:[next],previousNodes:new Map([[id,old]])});
  assert.equal(result.updatedNodes,1);assert.equal(result.createdNodes,0);
  const replay=await persistDomainBatch(db,{nodes:[next],previousNodes:new Map([[id,old]])});
  assert.equal(replay.updatedNodes,0);
  await db.entity.update({where:{id},data:{description:'User correction'}});
  await assert.rejects(()=>persistDomainBatch(db,{nodes:[next],previousNodes:new Map([[id,old]])}),/conflict/);
  assert.equal((await db.entity.findUnique({where:{id}})).description,'User correction');
 } finally {await db.entity.deleteMany({where:{id}});}
});

test('refresh rolls back changed evidence when a later assertion fails',{skip:!enabled},async()=>{
 const {persistDomainBatch}=require('../src/domain/repository');
 const db=isolated(),prefix='refresh-edge:'+randomUUID();
 const a=new domain.Recording({id:prefix+':r',name:'Before'}),b=new domain.Work({id:prefix+':w',name:'Work'});
 const old=new domain.PerformanceOf({source:a,target:b,assertionKey:prefix,properties:{source:'musicbrainz',description:'Before'}});
 const next=new domain.PerformanceOf({source:a,target:b,assertionKey:prefix,properties:{source:'musicbrainz',description:'After'}});
 try {
  await persistDomainBatch(db,{nodes:[a,b],relationships:[old]});
  const result=await persistDomainBatch(db,{relationships:[next],previousRelationships:new Map([[old.id,old]])});
  assert.equal(result.updatedRelationships,1);
  assert.equal((await persistDomainBatch(db,{relationships:[next],previousRelationships:new Map([[old.id,old]])})).updatedRelationships,0);
  const missing=new domain.Work({id:prefix+':missing',name:'Missing'});
  const bad=new domain.PerformanceOf({source:a,target:missing,assertionKey:prefix});
  await assert.rejects(()=>persistDomainBatch(db,{nodes:[new domain.Recording({id:a.id,name:'After'})],previousNodes:new Map([[a.id,a]]),relationships:[bad]}));
  assert.equal((await db.entity.findUnique({where:{id:a.id}})).name,'Before');
  await db.relationship.update({where:{id:next.id},data:{role:'User correction'}});
  await assert.rejects(()=>persistDomainBatch(db,{relationships:[next],previousRelationships:new Map([[old.id,old]])}),/conflict/);
  assert.equal((await db.relationship.findUnique({where:{id:next.id}})).role,'User correction');
 } finally {await db.relationship.deleteMany({where:{sourceId:a.id}});await db.entity.deleteMany({where:{id:{in:[a.id,b.id]}}});}
});


test('refresh batches distinct payloads including arrays, JSON, cleared fields and quoted text',{skip:!enabled},async()=>{
 const {persistDomainBatch}=require('../src/domain/repository');
 const db=isolated(),prefix='bulk-refresh:'+randomUUID();
 const old=[new domain.Recording({id:prefix+':a',name:'Old A',properties:{description:'Remove this'}}),new domain.Recording({id:prefix+':b',name:'Old B'})];
 const next=[new domain.Recording({id:old[0].id,name:'A "quote"',properties:{sample:{array:[1,2],text:"O'Reilly"}}}),new domain.Recording({id:old[1].id,name:'Different B',properties:{description:'Keep this'}})];
 try {
  await persistDomainBatch(db,{nodes:old});
  const result=await persistDomainBatch(db,{nodes:next,previousNodes:new Map(old.map(n=>[n.id,n]))});
  assert.equal(result.updatedNodes,2);
  const rows=await db.entity.findMany({where:{id:{in:old.map(n=>n.id)}},orderBy:{id:'asc'}});
  assert.equal(rows[0].description,null);assert.equal(rows[0].name,'A "quote"');assert.deepEqual(rows[0].extra.sample,{array:[1,2],text:"O'Reilly"});
  assert.equal(rows[1].description,'Keep this');assert.equal(rows[1].name,'Different B');
  assert.equal((await persistDomainBatch(db,{nodes:next,previousNodes:new Map(old.map(n=>[n.id,n]))})).updatedNodes,0);
 } finally {await db.entity.deleteMany({where:{id:{in:old.map(n=>n.id)}}});}
});
