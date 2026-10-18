const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto');
const domain=require('../src/domain');
const {digest,uploadEvidenceArchive}=require('../src/evidenceArchive');
const {prepareEvidenceArchive}=require('../src/import/evidencePreparation');
const {loadIsolatedSnapshot}=require('../src/import/graphSnapshot');
const {getDatabase,closeDatabase}=require('../src/postgres');
const enabled=process.env.MUSICMESH_TEST_EVIDENCE==='azure-local';
test.after(closeDatabase);
test('uploaded compact import preserves source snapshots and carries user corrections across incremental refresh',{skip:!enabled},async()=>{
 const url=new URL(process.env.DATABASE_URL);
 assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'55433');assert.equal(url.pathname,'/musicmesh_restore');
 const db=getDatabase(),prefix='evidence-integration:'+randomUUID(),root=path.resolve('output/tests',prefix.replace(':','-'));
 const sourceInput={test:prefix},hashes=[];
 fs.mkdirSync(root,{recursive:true});
 const raw={fixture:'MusicMesh storage verification',text:'lossless test evidence '.repeat(70)};
 const a=new domain.Recording({id:prefix+':a',name:'Original recording',properties:{rawProvider:raw}});
 const b=new domain.Work({id:prefix+':b',name:'Original work',properties:{rawProvider:raw}});
 const edge=new domain.PerformanceOf({source:a,target:b,assertionKey:prefix});
 async function snapshot(name,nodes){
  const directory=path.join(root,name),archiveDirectory=path.join(root,name+'-archive');fs.mkdirSync(directory);
  const files={};
  for(const [file,rows] of [['nodes.ndjson',nodes.map(n=>n.toGraphNode())],['relationships.ndjson',[edge.toGraphRelationship()]]]){
   const bytes=rows.map(JSON.stringify).join('\n')+'\n';fs.writeFileSync(path.join(directory,file),bytes);files[file]=digest(bytes);
  }
  fs.writeFileSync(path.join(directory,'manifest.json'),JSON.stringify({version:1,ontologyVersion:domain.getOntology().version,sourceInput,nodes:2,relationships:1,files}));
  await prepareEvidenceArchive({directory,outputDir:archiveDirectory});await uploadEvidenceArchive(archiveDirectory);
  hashes.push(digest(JSON.stringify(files)),'evidence-v1:'+digest(JSON.stringify(files)));
  return {directory,archiveDirectory};
 }
 try{
  const first=await snapshot('first',[a,b]);
  const receipt=await loadIsolatedSnapshot(first);
  assert.equal(receipt.createdNodes,2);assert.equal(receipt.createdRelationships,1);
  assert.equal((await db.entity.findUnique({where:{id:a.id}})).extra.rawProvider,undefined);
  await db.entity.update({where:{id:a.id},data:{description:'Later user correction'}});
  const nextB=new domain.Work({id:b.id,name:'Enriched work',properties:b.properties});
  const next=await snapshot('next',[a,nextB]);
  const refreshed=await loadIsolatedSnapshot({...next,previousDirectory:first.directory});
  assert.equal(refreshed.carriedNodes,1);assert.equal(refreshed.carriedRelationships,1);
  assert.equal(refreshed.verifiedNodes,1);assert.equal(refreshed.updatedNodes,1);
  assert.equal((await db.entity.findUnique({where:{id:a.id}})).description,'Later user correction');
  const again=await loadIsolatedSnapshot({...next,previousDirectory:next.directory});
  assert.equal(again.verifiedNodes,0);assert.equal(again.carriedNodes,2);
  await assert.rejects(()=>loadIsolatedSnapshot({directory:next.directory,previousDirectory:first.directory}),/require --archive/);
  await assert.rejects(()=>loadIsolatedSnapshot(next),/conflict/,'full verification still detects the later correction');
  assert.ok(fs.readFileSync(path.join(first.directory,'nodes.ndjson'),'utf8').includes('rawProvider'));
 }finally{
  await db.relationship.deleteMany({where:{id:edge.id}});await db.entity.deleteMany({where:{id:{in:[a.id,b.id]}}});await db.importBatch.deleteMany({where:{sourceHash:{in:hashes}}});
 }
});
