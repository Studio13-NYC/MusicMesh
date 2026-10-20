const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const domain=require('../src/domain'),{persistDomainBatch}=require('../src/domain/repository');
const {getDatabase,closeDatabase}=require('../src/postgres'),{expandRow}=require('../src/packedEvidence');
const enabled=process.env.MUSICMESH_TEST_PACKED==='azure-local';
test.after(closeDatabase);
test('packed import creates, reads, refreshes and replays through Prisma and private Azure',{skip:!enabled},async()=>{
 const u=new URL(process.env.DATABASE_URL);assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55433');assert.equal(u.pathname,'/musicmesh_restore');
 const db=getDatabase();const a=new domain.Artist({externalId:{provider:'musicbrainz',type:'artist',value:randomUUID()},name:'Packed fixture',properties:{providerEvidence:{url:'https://example.com/fixture',note:'local test source '.repeat(20)}}});
 const b=new domain.Artist({externalId:{provider:'musicbrainz',type:'artist',value:randomUUID()},name:'Packed second fixture',properties:a.properties});
 const e=new domain.MusicBrainzRelationship({source:a,target:b,assertionKey:'test-packed',properties:{providerTypeId:randomUUID(),providerTypeName:'fixture',sourceType:'Artist',targetType:'Artist',providerEvidence:a.properties.providerEvidence}});
 try{
  const first=await persistDomainBatch(db,{nodes:[a,b],relationships:[e],compactEvidence:true,packedEvidence:true});assert.equal(first.createdNodes,2);assert.equal(first.createdRelationships,1);
  const stored=await db.entity.findUnique({where:{id:a.id}});assert.ok(stored.extra.detailsRef);assert.equal(stored.domainId,null);
  const restored=await expandRow(stored);assert.deepEqual(restored.extra.providerEvidence,a.properties.providerEvidence);
  const next=new domain.Artist({id:a.id,externalId:a.externalId,name:'Updated packed fixture',properties:a.properties});
  const batch={nodes:[next],previousNodes:new Map([[a.id,a]]),compactEvidence:true,packedEvidence:true};
  assert.equal((await persistDomainBatch(db,batch)).updatedNodes,1);
  assert.equal((await persistDomainBatch(db,batch)).updatedNodes,0);
  await db.entity.update({where:{id:a.id},data:{description:'User correction'}});
  await assert.rejects(()=>persistDomainBatch(db,batch),/conflict/);
 }finally{await db.relationship.deleteMany({where:{id:e.id}});await db.entity.deleteMany({where:{id:{in:[a.id,b.id]}}});}
});
