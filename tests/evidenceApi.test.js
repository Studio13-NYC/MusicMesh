const test=require('node:test'),assert=require('node:assert/strict');
const {getPublicEvidence}=require('../src/evidenceService');
test('evidence lookup requires a visible graph record and never accepts arbitrary hashes',async()=>{
 let reads=0;
 const options={db:{entity:{findFirst:async()=>null}},readEvidence:async()=>{reads++;}};
 assert.equal(await getPublicEvidence({kind:'node',id:'private',field:'providerEvidence'},options),null);
 assert.equal(reads,0);
 await assert.rejects(()=>getPublicEvidence({kind:'blob',id:'abcdef',field:'rawProvider'},options),/Invalid/);
});
test('evidence resolves the stored reference and returns explicit provenance context',async()=>{
 const ref={version:1,sha256:'a'.repeat(64),bytes:1000};
 const result=await getPublicEvidence({kind:'node',id:'recording',field:'rawProvider'},{db:{entity:{findFirst:async()=>({extra:{evidenceRefs:{rawProvider:ref},providerEvidence:{url:'provider'}}})}},readEvidence:async r=>{assert.deepEqual(r,ref);return {title:'Song'};}});
 assert.equal(result.id,'recording');assert.deepEqual(result.value,{title:'Song'});assert.equal(result.reference.sha256,ref.sha256);
});
