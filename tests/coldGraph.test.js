const test=require('node:test'),assert=require('node:assert/strict');
const {packColdRows,restoreColdRow,hydrateColdRow,createPageCache}=require('../src/coldGraph');
const {packRows,expandRow}=require('../src/packedEvidence');
function sample(kind='SimilarityAssessment'){
 return {id:kind==='Url'?'musicbrainz:url:12345678-1234-1234-1234-123456789abc':'musicmesh:similarity:one',primaryLabel:kind,labels:[kind],name:'Example',searchText:'Example',domainId:null,source:kind==='Url'?'musicbrainz':'musicmesh',evidenceBasis:'provider',threadId:null,extra:{score:0.25,method:'example method',recordingIds:['one','two'],providerEvidence:{data:'a'.repeat(600)}}};
}
test('cold nodes retain searchable identity; exact archived payload and nested packed evidence restore',async()=>{
 for(const kind of ['Url','SimilarityAssessment']){
  const original=sample(kind),packed=packRows([original]),cold=packColdRows(packed.rows),next=cold.rows[0];
  assert.equal(next.name,original.name);assert.equal(next.searchText,original.searchText);assert.equal(next.id,original.id);
  assert.equal(next.extra.score,undefined);assert.equal(next.source,null);
  assert.deepEqual(restoreColdRow(next,cold.pages[0].document),packed.rows[0]);
  const pages=new Map([...packed.pages,...cold.pages].map(p=>[Buffer.from(p.reference.sha256,'hex').toString('base64url'),p.document]));
  assert.deepEqual(await expandRow(next,{readPage:async ref=>pages.get(ref)}),original);
 }
});
test('cold relationship directory retains directions, type and traversal roles',()=>{
 const row={id:'edge',sourceId:'artist',targetId:'musicbrainz:url:one',type:'MusicBrainzRelationship',source:'musicbrainz',role:null,extra:{providerTypeName:'official homepage',providerTypeId:'role-id',attributes:[],detailsRef:'existing'}};
 const result=packColdRows([row],{relationship:true}),next=result.rows[0];
 assert.equal(next.sourceId,row.sourceId);assert.equal(next.targetId,row.targetId);assert.equal(next.type,row.type);
 assert.equal(next.extra.providerTypeName,'official homepage');
 assert.deepEqual(restoreColdRow(next,result.pages[0].document,{relationship:true}),row);
 assert.throws(()=>restoreColdRow({...next,targetId:'another'},result.pages[0].document,{relationship:true}),/conflict/);
 assert.throws(()=>restoreColdRow({...next,id:'another'},result.pages[0].document,{relationship:true}),/identity/);
});
test('research, sources, listening history and operator-owned objects are never offloaded',()=>{
 for(const kind of ['EvidenceAssertion','SourceDocument','ListeningEvent','IdentityMapping','PreferenceSignal']){
  const row=sample(kind);assert.deepEqual(packColdRows([row]),{rows:[row],pages:[]});
 }
 const edited={...sample(),lastChatThreadId:'research-thread'};
 assert.deepEqual(packColdRows([edited]).rows,[edited]);
 const edge={id:'claim-source',sourceId:'claim',targetId:'source',type:'SupportedBySource',extra:{confidenceHistory:[90]}};
 assert.deepEqual(packColdRows([edge],{relationship:true}).rows,[edge]);
});
test('cache is bounded, coalesces requests, expires and rejects corrupt content',async()=>{
 const pages=[sample(),{...sample(),id:'musicmesh:similarity:other'}].map(row=>packColdRows([row]).pages[0]);
 const ref=p=>Buffer.from(p.reference.sha256,'hex').toString('base64url');
 let calls=0,now=0;
 const cache=createPageCache({maxBytes:pages[0].data.length+50,ttlMs:10,now:()=>now,read:async key=>{calls++;return pages.find(p=>ref(p)===key).document;}});
 await Promise.all([cache.get(ref(pages[0])),cache.get(ref(pages[0]))]);assert.equal(calls,1);
 await cache.get(ref(pages[1]));assert.equal(cache.stats().entries,1);assert.ok(cache.stats().bytes<=cache.stats().maxBytes);
 now=20;await cache.get(ref(pages[1]));assert.equal(calls,3);
 const corrupt=createPageCache({read:async()=>({changed:true})});
 await assert.rejects(corrupt.get(ref(pages[0])),/checksum/);
});
test('private evidence authorization precedes cold page reads and storage failures are not empty results',async()=>{
 const {getPublicEvidence}=require('../src/evidenceService'),cold=packColdRows([sample()]);
 let reads=0;const db={entity:{findFirst:async()=>null}};
 const params={kind:'node',id:sample().id,field:'details'},readPage=async()=>{reads++;return cold.pages[0].document};
 assert.equal(await getPublicEvidence(params,{db,readPage}),null);assert.equal(reads,0);
 db.entity.findFirst=async()=>cold.rows[0];
 assert.equal((await getPublicEvidence(params,{db,readPage})).value.score,0.25);
 await assert.rejects(hydrateColdRow(cold.rows[0],{readPage:async()=>{throw Error('Azure unavailable')}}),/Azure unavailable/);
});
