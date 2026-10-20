const test=require('node:test'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const domain=require('../src/domain'),{persistDomainBatch}=require('../src/domain/repository');
const {getDatabase,closeDatabase}=require('../src/postgres'),{expandRow}=require('../src/packedEvidence');
const {MARKER}=require('../src/coldGraph');
test.after(closeDatabase);
test('cold links are discoverable in both directions, searchable, readable and preserved on refresh',{skip:process.env.MUSICMESH_TEST_COLD!=='azure-local'},async()=>{
 const u=new URL(process.env.DATABASE_URL);
 assert.equal(u.hostname,'127.0.0.1');assert.equal(u.port,'55433');assert.equal(u.pathname,'/musicmesh_restore');
 const db=getDatabase(),priorMarker=await db.importBatch.findUnique({where:{sourceHash:MARKER}});
 const artist=new domain.Artist({externalId:{provider:'musicbrainz',type:'artist',value:randomUUID()},name:'Cold graph fixture '+randomUUID(),properties:{source:'musicbrainz'}});
 const url=new domain.Url({externalId:{provider:'musicbrainz',type:'url',value:randomUUID()},name:'https://example.com/'+randomUUID(),properties:{source:'musicbrainz',rawProvider:{resource:'https://example.com/fixture'},providerEvidence:{note:'cold graph fixture '.repeat(40)}}});
 const edge=new domain.MusicBrainzRelationship({source:artist,target:url,assertionKey:'homepage',properties:{source:'musicbrainz',providerTypeId:randomUUID(),providerTypeName:'official homepage',sourceType:'Artist',targetType:'Url'}});
 try{
  if(!priorMarker)await db.importBatch.create({data:{sourceHash:MARKER,nodes:0,relationships:0}});
  const batch={nodes:[artist,url],relationships:[edge],compactEvidence:true,packedEvidence:true};
  const receipt=await persistDomainBatch(db,batch);assert.equal(receipt.createdNodes,2);assert.equal(receipt.createdRelationships,1);
  const stored=await db.entity.findUnique({where:{id:url.id}});assert.ok(stored.extra.coldRef);
  assert.deepEqual((await expandRow(stored)).extra.rawProvider,url.properties.rawProvider);
  const store=require('../src/graphStore');
  assert.equal((await store.searchEntities(url.name,2))[0].id,url.id);
  assert.equal((await store.detail(url.id,[],[],10)).relationshipCount,1);
  for(const seed of [artist.id,url.id]){
   const graph=await store.neighborhood([seed],{depth:1,pathLimit:10,nodeLimit:10,edgeLimit:10});
   assert.equal(graph.nodes.length,2);assert.equal(graph.relationships[0].id,edge.id);
   assert.equal(graph.relationships[0].properties.providerTypeName,'official homepage');
  }
  assert.equal((await persistDomainBatch(db,batch)).createdNodes,0);
  const next=new domain.Url({id:url.id,externalId:url.externalId,name:url.name,properties:{...url.properties,description:'New verified description'}});
  const update={nodes:[next],previousNodes:new Map([[url.id,url]]),compactEvidence:true,packedEvidence:true};
  assert.equal((await persistDomainBatch(db,update)).updatedNodes,1);
  assert.ok((await db.entity.findUnique({where:{id:url.id}})).extra.coldRef);
  assert.equal((await store.detail(url.id,[],[],10)).node.properties.description,'New verified description');
  assert.equal((await persistDomainBatch(db,update)).updatedNodes,0);
  await db.entity.update({where:{id:url.id},data:{description:'Concurrent correction'}});
  await assert.rejects(()=>persistDomainBatch(db,update),/conflict/);
 }finally{
  await db.relationship.deleteMany({where:{id:edge.id}});
  await db.entity.deleteMany({where:{id:{in:[artist.id,url.id]}}});
  if(!priorMarker)await db.importBatch.delete({where:{sourceHash:MARKER}});
 }
});
