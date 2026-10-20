const test = require('node:test');
const assert = require('node:assert/strict');
const {packRows, restoreRow, referenceHash, projectIdentity} = require('../src/packedEvidence');

const id='musicbrainz:artist:12345678-1234-1234-1234-123456789abc';
function row(){return {id,domainId:id,primaryLabel:'Artist',labels:['Artist'],name:'Artist',extra:{externalId:{provider:'musicbrainz',type:'artist',value:id.split(':')[2]},ontologyVersion:'1.3.1',country:'GB',providerEvidence:{url:'https://musicbrainz.org/ws/2/artist/'+id,body:'x'.repeat(600)},rawProvider:{aliases:['A']}}};}
test('packed rows round trip exactly and retain graph-query facts',()=>{
 const original=row(),result=packRows([original]);
 assert.equal(result.pages.length,1);const next=result.rows[0];
 assert.equal(next.domainId,null);assert.equal(next.extra.providerEvidence,undefined);
 assert.equal(next.extra.country,'GB');assert.equal(next.name,'Artist');
 assert.deepEqual(restoreRow(next,result.pages[0].document),original);
 assert.equal(referenceHash(next.extra.detailsRef),result.pages[0].reference.sha256);
 assert.deepEqual(projectIdentity(next).externalId,original.extra.externalId);
 assert.deepEqual(original,row());
});
test('research claims, confidence history and private listening rows remain untouched',()=>{
 for(const primaryLabel of ['EvidenceAssertion','SourceDocument','PreferenceSignal','ListeningEvent','IdentityMapping']){
  const original={...row(),primaryLabel,extra:{...row().extra,confidenceHistory:[{score:42}]}};
  assert.deepEqual(packRows([original]).rows,[original]);
 }
 const original={id:'research-edge',type:'SupportedBySource',extra:{assertionKey:'source',providerEvidence:{text:'x'.repeat(600)}}};
 assert.deepEqual(packRows([original],{relationship:true}).rows,[original]);
});
test('packed pages are bounded and cannot resolve another identity or kind',()=>{
 const rows=Array.from({length:5},(_,n)=>({...row(),id:id+n}));
 const result=packRows(rows,{pageSize:2});assert.equal(result.pages.length,3);
 assert.throws(()=>restoreRow({...result.rows[0],id:'other'},result.pages[0].document),/identity/);
 assert.throws(()=>restoreRow(result.rows[0],{...result.pages[0].document,kind:'relationship'}),/kind/);
 assert.throws(()=>referenceHash('../bad'),/reference/);
});
test('small structural edges do not grow and conflicting identities are preserved',()=>{
 const edge={id:'e',type:'HasTrack',extra:{assertionKey:'track',ontologyVersion:'1.3.1'}};
 assert.deepEqual(packRows([edge],{relationship:true}).rows,[edge]);
 const original=row();original.domainId='different';original.extra.externalId.value='different';
 original.extra.definitionUrl='https://example.com/user-definition';
 const next=packRows([original]).rows[0];assert.equal(next.domainId,'different');
 assert.deepEqual(next.extra.externalId,original.extra.externalId);
 assert.equal(projectIdentity(next).definitionUrl,original.extra.definitionUrl);
});
test('public evidence resolves a packed field only after the owning row is authorized',async()=>{
 const {getPublicEvidence}=require('../src/evidenceService');
 const original=row(),packed=packRows([original]);let reads=0;
 const readPage=async()=>{reads++;return packed.pages[0].document};
 const db={entity:{findFirst:async()=>packed.rows[0]}};
 const result=await getPublicEvidence({kind:'node',id,field:'rawProvider'},{db,readPage});
 assert.deepEqual(result.value,original.extra.rawProvider);assert.equal(reads,1);
 const details=await getPublicEvidence({kind:'node',id,field:'details'},{db,readPage});
 assert.deepEqual(details.value.providerEvidence,original.extra.providerEvidence);
 db.entity.findFirst=async()=>null;
 assert.equal(await getPublicEvidence({kind:'node',id,field:'details'},{db,readPage}),null);
 assert.equal(reads,2);
});
