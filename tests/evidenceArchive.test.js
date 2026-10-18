const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {compactProperties,LocalEvidenceArchive,decodeEvidence,blobName}=require('../src/evidenceArchive');
test('large evidence is lossless, deduplicated, and leaves query fields and small provenance inline',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'musicmesh-evidence-'));
 try {
  const archive=new LocalEvidenceArchive(dir),raw={country:'KR',disambiguation:'Edition',text:'音楽'.repeat(2000)};
  const source={rawProvider:raw,providerEvidence:{url:'https://musicbrainz.org/x',responseHash:'abc'},observations:[{assertion:raw}],features:{bpm:91},name:'Title'};
  const compact=compactProperties(source,(ref,bytes)=>archive.put(ref,bytes));
  assert.equal(compact.rawProvider,undefined);assert.equal(compact.country,'KR');assert.deepEqual(compact.features,source.features);
  assert.deepEqual(compact.providerEvidence,source.providerEvidence);assert.equal(source.rawProvider,raw);
  assert.deepEqual(archive.read(compact.evidenceRefs.rawProvider),raw);
  assert.deepEqual(archive.read(compact.evidenceRefs.observations),source.observations);
  const {catalogProperties}=require('../src/graphCanonRepository');
  const withVideo={rawProvider:{video:true,country:'KR',text:raw.text}};
  const projected=catalogProperties(compactProperties(withVideo));
  assert.equal(projected.video,catalogProperties(withVideo).video);
  compactProperties({...source,rawProvider:{text:raw.text,disambiguation:'Edition',country:'KR'}},(ref,bytes)=>archive.put(ref,bytes));
  assert.equal(archive.entries.size,2);assert.deepEqual(compactProperties(compact),compact);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('evidence rejects hash mismatch, traversal references and oversized decompression',()=>{
 const zlib=require('node:zlib'),crypto=require('node:crypto');
 const bytes=Buffer.from(JSON.stringify({a:'x'.repeat(2000)})),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
 const ref={version:1,sha256,bytes:bytes.length};
 assert.throws(()=>decodeEvidence(ref,zlib.gzipSync(Buffer.from('{}'))),/checksum|length/);
 assert.throws(()=>blobName({...ref,sha256:'../../secret'}),/reference/);
 assert.throws(()=>decodeEvidence({...ref,bytes:1000000000},zlib.gzipSync(bytes)),/limit/);
});
test('upload resumes existing blobs using their actual length and verifies content before receipt',async()=>{
 const {uploadEvidenceArchive}=require('../src/evidenceArchive');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'musicmesh-upload-'));
 try{
  const archive=new LocalEvidenceArchive(dir),p=compactProperties({rawProvider:{text:'x'.repeat(2000)}},(r,b)=>archive.put(r,b)),ref=p.evidenceRefs.rawProvider;
  fs.writeFileSync(path.join(dir,'archive-manifest.json'),JSON.stringify({version:1,documents:[ref]}));
  const data=fs.readFileSync(path.join(dir,blobName(ref)));
  const container={accountName:'test',createIfNotExists:async()=>{},getProperties:async()=>({}),getBlockBlobClient:()=>({
   uploadData:async()=>{throw Object.assign(new Error('exists'),{statusCode:412});},
   getProperties:async()=>({contentLength:data.length,etag:'version-1'}),
   downloadToBuffer:async(offset,count,options)=>{assert.equal(offset,0);assert.equal(count,data.length);assert.equal(options.conditions.ifMatch,'version-1');return data;}
  })};
  const result=await uploadEvidenceArchive(dir,{container});assert.equal(result.created,0);assert.equal(result.verified,1);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('failed uploads settle in-flight work and never publish a verified receipt',async()=>{
 const {uploadEvidenceArchive}=require('../src/evidenceArchive');
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'musicmesh-upload-failure-'));
 try{
  const archive=new LocalEvidenceArchive(dir);
  for(let i=0;i<12;i++)compactProperties({rawProvider:{i,text:'x'.repeat(1000)}},(r,b)=>archive.put(r,b));
  fs.writeFileSync(path.join(dir,'archive-manifest.json'),JSON.stringify({version:1,documents:[...archive.entries.values()]}));
  let calls=0,settled=false,release;const pending=new Promise(resolve=>{release=resolve;});
  const container={createIfNotExists:async()=>{},getProperties:async()=>({}),getBlockBlobClient:()=>({uploadData:async()=>{calls++;if(calls===1)throw new Error('Storage unavailable');await pending;}})};
  const run=uploadEvidenceArchive(dir,{container}).finally(()=>{settled=true;});
  // Attach rejection handling before yielding, so failures never become unhandled.
  const rejected=assert.rejects(run,/Storage unavailable/);
  await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);
  release();await rejected;assert.ok(calls<=8);assert.equal(fs.existsSync(path.join(dir,'archive-upload-receipt.json')),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
