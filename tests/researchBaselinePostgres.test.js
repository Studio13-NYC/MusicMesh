const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const d=require('../src/domain'),{sha256}=require('../src/import/history');
const {persistDomainBatch}=require('../src/domain/repository');
const {loadIsolatedSnapshot,assertIsolatedTarget}=require('../src/import/graphSnapshot');
const {getDatabase,closeDatabase}=require('../src/postgres');
test.after(closeDatabase);
test('real additive import preserves research and refuses later edits with historical CAS versions',{skip:process.env.MUSICMESH_TEST_BRAINZ!=='isolated'},async()=>{
 assertIsolatedTarget(process.env.DATABASE_URL);
 const db=getDatabase(),prefix='research-refresh:'+randomUUID(),root=path.resolve('output/tests',prefix.replace(':','-'));
 fs.mkdirSync(root,{recursive:true});
 const a=new d.Recording({id:prefix+':r',name:'Original recording',ontologyVersion:'1.2.0'});
 const w=new d.Work({id:prefix+':w',name:'Research work'}),keep=new d.Technique({id:prefix+':technique',name:'Preserved technique'});
 const edge=new d.PerformanceOf({source:a,target:w,assertionKey:prefix});
 const hashes=[];
 function snapshot(name,nodes,edges,version='1.3.1'){
  const dir=path.join(root,name);fs.mkdirSync(dir,{recursive:true});const files={};
  for(const [file,rows] of [['nodes.ndjson',nodes.map(n=>n.toGraphNode())],['relationships.ndjson',edges.map(e=>e.toGraphRelationship())]]){const bytes=rows.map(JSON.stringify).join('\n')+'\n';fs.writeFileSync(path.join(dir,file),bytes);files[file]=sha256(bytes);}
  fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({version:1,ontologyVersion:version,sourceInput:{test:prefix},nodes:nodes.length,relationships:edges.length,files}));
  hashes.push(sha256(JSON.stringify(files)));return {dir,files};
 }
 try{
  const before=snapshot('previous',[a],[],'1.2.0');
  await persistDomainBatch(db,{nodes:[a]});
  await db.importBatch.create({data:{sourceHash:hashes[0],nodes:1,relationships:0}});
  const delta=snapshot('research/catalog-extension',[w,keep],[edge]);
  const researchDir=path.dirname(delta.dir),packet=JSON.stringify({claims:[]});
  fs.writeFileSync(path.join(researchDir,'claims.json'),packet);
  const sourceHash='operator-enrichment:'+sha256(JSON.stringify(delta.files)+sha256(packet));hashes.push(sourceHash);
  await persistDomainBatch(db,{nodes:[w,keep],relationships:[edge]});
  await db.importBatch.create({data:{sourceHash,nodes:2,relationships:1}});
  fs.writeFileSync(path.join(researchDir,'main-persistence-receipt.json'),JSON.stringify({sourceHash,state:'committed',counts:{nodes:2,relationships:1}}));
  const nextW=new d.Work({id:w.id,name:'Hydrated work'}),next=snapshot('next',[new d.Recording({id:a.id,name:'Recording enriched'}),nextW],[edge]);
  const result=await loadIsolatedSnapshot({directory:next.dir,previousDirectory:before.dir,researchDirectories:[researchDir]});
  assert.equal(result.updatedNodes,2);
  assert.equal(result.researchBaselines.length,1);
  assert.equal((await db.entity.findUnique({where:{id:keep.id}})).name,'Preserved technique');
  assert.equal((await db.entity.findUnique({where:{id:a.id}})).extra.ontologyVersion,'1.3.1');
  await db.entity.update({where:{id:w.id},data:{description:'Nick added a correction'}});
  const future=snapshot('future',[new d.Recording({id:a.id,name:'Another enrichment'}),new d.Work({id:w.id,name:'Provider changed work'})],[edge]);
  await assert.rejects(()=>loadIsolatedSnapshot({directory:future.dir,previousDirectory:next.dir}),/conflict/);
  assert.equal((await db.entity.findUnique({where:{id:w.id}})).description,'Nick added a correction');
  assert.equal((await db.entity.findUnique({where:{id:a.id}})).name,'Recording enriched','failed batch rolls back its other updates');
 }finally{
  await db.relationship.deleteMany({where:{id:edge.id}});
  await db.entity.deleteMany({where:{id:{in:[a.id,w.id,keep.id]}}});
  await db.importBatch.deleteMany({where:{sourceHash:{in:hashes}}});
 }
});
