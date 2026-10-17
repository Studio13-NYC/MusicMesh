const test=require('node:test'),assert=require('node:assert/strict');
const {lowLevelUrl,validateBulk,analysisFromDocument}=require('../src/import/acousticFeatures');
const collect=async stream=>{const result=[];for await(const item of await stream)result.push(item);return result;};
const a='bf7c0045-d389-4ef9-9df4-0a375000076c',b='2f6ba60a-5ebb-4856-a4bb-3d31adae806c';
const document=()=>({metadata:{version:{extractor:'music 1.0',essentia:'2.1-beta2'},audio_properties:{analysis_sample_rate:44100,length:200,downmix:'mix',equal_loudness:0},tags:{file_name:'never publish this'}},rhythm:{bpm:120,onset_rate:3,danceability:1.4},lowlevel:{mfcc:{mean:Array.from({length:13},(_,i)=>i)}},tonal:{key_key:'A',key_scale:'minor',key_strength:0.8}});
test('timed-out bulk feature requests split while service failures retain their error status',async()=>{
 const {fetchFeatureBatch}=require('../src/import/acousticFeatures');const calls=[];
 const client={get:async(url)=>{const ids=new URL(url).searchParams.get('recording_ids').split(';').map(x=>x.split(':')[0]);calls.push(ids);return ids.length>1?{status:'error',reason:'request-timeout'}:{status:'ok',url,body:{[ids[0]]:{'0':document()}}};}};
 const result=await collect(fetchFeatureBatch(client,[{id:a},{id:b}]));assert.equal(result.length,2);assert.ok(result.every(r=>r.response.status==='ok'));assert.equal(calls.length,3);
 const service=await collect(fetchFeatureBatch({get:async()=>({status:'error',reason:'HTTP 503'})},[{id:a},{id:b}]));assert.equal(service.length,1);assert.equal(service[0].response.status,'error');
});
test('split batches stop issuing requests when three yielded failures trip the circuit breaker',async()=>{
 const {fetchFeatureBatch}=require('../src/import/acousticFeatures');let singles=0,calls=0;
 const client={get:async(url)=>{calls++;const ids=new URL(url).searchParams.get('recording_ids').split(';');if(ids.length===1){singles++;return {status:'error',reason:'HTTP 503'};}return {status:'error',reason:'request-timeout'};}};
 const batch=Array.from({length:25},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i).padStart(12,'0')}));let failures=0;
 for await(const {response} of await fetchFeatureBatch(client,batch)){if(response.status==='error'&&++failures===3)break;}
 assert.equal(singles,3);assert.ok(calls<15);
});
test('bulk acoustic requests preserve offsets and reject unexpected identities',()=>{
  assert.equal(new URL(lowLevelUrl([a,b],0)).searchParams.get('recording_ids'),a+':0;'+b+':0');
  assert.throws(()=>lowLevelUrl(Array(26).fill(a)),/25/);
  validateBulk({[a]:{'0':document()}},[a,b],0);
  assert.throws(()=>validateBulk({[a]:{'1':document()}},[a],0),/offset/);
  assert.throws(()=>validateBulk({[b]:{'0':document()}},[a],0),/identity/);
});
test('analyses retain version, units, submission identity and measurements without publishing file tags',()=>{
  const one=analysisFromDocument(a,0,document(),{url:'https://acousticbrainz.org/api/v1/low-level',responseHash:'hash'},7);
  const two=analysisFromDocument(a,1,document(),{},7);
  assert.notEqual(one.id,two.id);
  assert.equal(one.properties.features.rhythm.danceability.value,1.4);
  assert.equal(one.properties.features.rhythm.bpm.unit,'beats/minute');
  assert.equal(one.properties.availableSubmissions,7);
  assert.match(one.properties.extractorVersion,/2.1-beta2/);
  assert.ok(!JSON.stringify(one).includes('file_name'));
  const missing=document();delete missing.metadata.version;
  assert.throws(()=>analysisFromDocument(a,0,missing,{},1),/version/);
  const invalid=document();invalid.rhythm.bpm=Infinity;
  assert.throws(()=>analysisFromDocument(a,0,invalid,{},1),/finite/);
  const sparse=document();delete sparse.rhythm.onset_rate;
  assert.equal(analysisFromDocument(a,0,sparse,{},1).properties.features.rhythm.onsetRate,undefined);
});
test('feature collection resumes failures, verifies count evidence and publishes a checksummed partial catalog',async t=>{
  const fs=require('node:fs'),path=require('node:path');
  const {prepareHistory,sha256}=require('../src/import/history'),{ProviderCache}=require('../src/import/providerCache');
  const {fetchAcousticCoverage}=require('../src/import/acousticCoverage'),{fetchAcousticFeatures}=require('../src/import/acousticFeatures');
  const root=path.join(__dirname,'..','output','tests');fs.mkdirSync(root,{recursive:true});
  const dir=fs.mkdtempSync(path.join(root,'acoustic-features-'));t.after(()=>fs.rmSync(dir,{recursive:true}));
  const source=path.join(dir,'source.csv'),exp=path.join(dir,'export.json'),preparedDir=path.join(dir,'prepared'),coverageDir=path.join(dir,'coverage'),cacheDir=path.join(dir,'features');
  fs.writeFileSync(source,'uts,artist,album,track\n1700000000,A,B,C\n');
  fs.writeFileSync(exp,JSON.stringify([{listened_at:1700000000,track_metadata:{artist_name:'A',release_name:'B',track_name:'C',mbid_mapping:{recording_mbid:a}}}]));
  prepareHistory({sourcePath:source,account:'test',outputDir:preparedDir,listenbrainzPath:exp,listenbrainzAccount:'target'});
  await fetchAcousticCoverage({preparedDir,cacheDir:coverageDir,client:new ProviderCache({dir:path.join(coverageDir,'responses'),provider:'acousticbrainz',sleep:async()=>{},fetchImpl:async()=>new Response(JSON.stringify({[a]:{count:7}}))})});
  let calls=0,status=503;
  const client=new ProviderCache({dir:path.join(cacheDir,'responses'),provider:'acousticbrainz',sleep:async()=>{},fetchImpl:async()=>{calls++;return new Response(JSON.stringify({[a]:{'0':document()}}),{status});}});
  assert.equal((await fetchAcousticFeatures({preparedDir,coverageDir,cacheDir,client})).errors,1);
  status=200;assert.equal((await fetchAcousticFeatures({preparedDir,coverageDir,cacheDir,client})).collected,1);
  const before=calls;await fetchAcousticFeatures({preparedDir,coverageDir,cacheDir,client});assert.equal(calls,before);
  const manifest=JSON.parse(fs.readFileSync(path.join(cacheDir,'manifest.json'))),bytes=fs.readFileSync(path.join(cacheDir,'analyses.ndjson'));
  assert.equal(manifest.files['analyses.ndjson'],sha256(bytes));assert.equal(manifest.results[0].status,'collected');
  const coverage=JSON.parse(fs.readFileSync(path.join(coverageDir,'coverage.json')));coverage.records[0].count=500;fs.writeFileSync(path.join(coverageDir,'coverage.json'),JSON.stringify(coverage));
  await assert.rejects(()=>fetchAcousticFeatures({preparedDir,coverageDir,cacheDir,client}),/count response/);
});
