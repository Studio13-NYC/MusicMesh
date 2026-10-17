const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const { ProviderCache, recordingUrl, validateRecording }=require('../src/import/providerCache');
const mbid='bf7c0045-d389-4ef9-9df4-0a375000076c';
test('aggregate AcousticBrainz 404 failures retry instead of becoming permanent negative cache',async t=>{
  let calls=0;
  const client=new ProviderCache({dir:sandbox(t),provider:'acousticbrainz',sleep:async()=>{},fetchImpl:async()=>{calls++;return new Response('{}',{status:calls===1?404:200});}});
  const url='https://acousticbrainz.org/api/v1/count?recording_ids='+mbid;
  assert.equal((await client.get(url,()=>{})).status,'not-found');
  assert.equal((await client.get(url,()=>{})).status,'ok');
  assert.equal(calls,2);
});
test('AcousticBrainz uses its own allowed origin and respects exhausted quota headers',async t=>{
  const dir=sandbox(t);let now=0,calls=0;const waits=[];
  const client=new ProviderCache({dir,provider:'acousticbrainz',now:()=>now,sleep:async ms=>{waits.push(ms);now+=ms;},fetchImpl:async()=>{calls++;return new Response('{}',{headers:{'X-RateLimit-Remaining':'0','X-RateLimit-Reset-In':'10'}});}});
  await client.get('https://acousticbrainz.org/api/v1/count?recording_ids='+mbid,()=>{});
  await client.get('https://acousticbrainz.org/api/v1/'+mbid+'/count',()=>{});
  assert.equal(calls,2);assert.ok(waits.some(ms=>ms>=10000));
  await assert.rejects(()=>client.get(recordingUrl(mbid),()=>{}),/Unsupported provider/);
});
function sandbox(t) {
  const root=path.join(__dirname,'..','output','tests');fs.mkdirSync(root,{recursive:true});
  const dir=fs.mkdtempSync(path.join(root,'provider-'));t.after(()=>fs.rmSync(dir,{recursive:true}));return dir;
}
test('provider retry honors rate limits and resumes verified cache without another request',async t=>{
  const dir=sandbox(t);let calls=0, now=0;const waits=[];
  const client=new ProviderCache({dir,now:()=>now,sleep:async ms=>{waits.push(ms);now+=ms;},fetchImpl:async()=>{
    calls++;if(calls===1)return new Response('busy',{status:429,headers:{'Retry-After':'3'}});
    return new Response(JSON.stringify({id:mbid,title:'Severed'}));
  }});
  const result=await client.get(recordingUrl(mbid),validateRecording);
  assert.equal(result.status,'ok');assert.equal(calls,2);assert.ok(waits.some(ms=>ms>=3000));
  assert.equal((await client.get(recordingUrl(mbid),validateRecording)).cacheHit,true);assert.equal(calls,2);
  const receipt=JSON.parse(fs.readFileSync(result.cachePath));receipt.body.title='tampered';fs.writeFileSync(result.cachePath,JSON.stringify(receipt));
  await assert.rejects(()=>client.get(recordingUrl(mbid),validateRecording),/checksum/);
});
test('service failures never become missing data; 404 is distinct and failed requests can resume',async t=>{
  const dir=sandbox(t);let status=503,calls=0;
  const client=new ProviderCache({dir,sleep:async()=>{},fetchImpl:async()=>{calls++;return new Response('not json',{status});}});
  const failed=await client.get(recordingUrl(mbid),validateRecording);
  assert.equal(failed.status,'error');assert.equal(calls,3);
  status=404;const missing=await client.get(recordingUrl(mbid),validateRecording);
  assert.equal(missing.status,'not-found');assert.equal(calls,4);
});
test('recording lookups preserve redirect identities and reject invalid provider bodies',async t=>{
  const dir=sandbox(t);const redirected='2f6ba60a-5ebb-4856-a4bb-3d31adae806c';
  const client=new ProviderCache({dir,sleep:async()=>{},fetchImpl:async()=>new Response(JSON.stringify({id:redirected,title:'A recording'}))});
  const result=await client.get(recordingUrl(mbid),validateRecording);
  assert.equal(result.body.id,redirected);assert.ok(result.url.includes(mbid));
  assert.throws(()=>recordingUrl('not-an-id'),/MBID/);
  assert.throws(()=>validateRecording({id:mbid,name:'Artist, not recording'}),/recording/);
});
