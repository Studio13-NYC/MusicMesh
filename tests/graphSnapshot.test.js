const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {prepareHistory}=require('../src/import/history');
const {compileSnapshot,readSnapshot,assertIsolatedTarget,assertMainDevelopmentTarget}=require('../src/import/graphSnapshot');
test('snapshot preserves unresolved plays, creates typed recording stubs, validates hashes and reloads classes',t=>{
  const root=path.join(__dirname,'..','output','tests');fs.mkdirSync(root,{recursive:true});
  const dir=fs.mkdtempSync(path.join(root,'snapshot-'));t.after(()=>fs.rmSync(dir,{recursive:true}));
  const csv=path.join(dir,'source.csv'),exp=path.join(dir,'export.json'),prepared=path.join(dir,'prepared');
  fs.writeFileSync(csv,'uts,artist,album,track\n1700000000,A,B,C\n1700000001,A,B,D\n');
  fs.writeFileSync(exp,JSON.stringify([{listened_at:1700000000,track_metadata:{artist_name:'A',release_name:'B',track_name:'C',mbid_mapping:{recording_mbid:'bf7c0045-d389-4ef9-9df4-0a375000076c',recording_name:'C'}}}]));
  prepareHistory({sourcePath:csv,account:'source',outputDir:prepared,listenbrainzPath:exp,listenbrainzAccount:'target'});
  const outputDir=path.join(dir,'graph');
  const receipt=compileSnapshot({preparedDir:prepared,cacheDir:path.join(dir,'cache'),outputDir});
  assert.equal(receipt.counts.ListeningEvent,2);assert.equal(receipt.counts.IdentityMapping,2);assert.equal(receipt.counts.Recording,1);
  assert.equal(receipt.recordingLookups.pending,1);assert.equal(receipt.databaseWritten,false);
  const graph=readSnapshot(outputDir);assert.equal(graph.relationships.length,3);
  assert.ok(graph.nodes.every(n=>typeof n.toGraphNode==='function'));
  fs.appendFileSync(path.join(outputDir,'nodes.ndjson'),'broken');
  assert.throws(()=>readSnapshot(outputDir),/checksum/);
});
test('isolated import refuses main development and unrelated databases',()=>{
  assert.throws(()=>assertIsolatedTarget('postgresql://u:p@ep-noisy-king-aunaaru0-pooler.c-10.us-east-1.aws.neon.tech/musicmesh'),/isolated/);
  assert.throws(()=>assertIsolatedTarget('postgresql://u:p@localhost/other'),/isolated/);
  assert.doesNotThrow(()=>assertIsolatedTarget('postgresql://u:p@ep-flat-glitter-au4xn3l9-pooler.c-10.us-east-1.aws.neon.tech/musicmesh?sslmode=verify-full'));
});
test('main development import explicitly selects MusicMesh main and rejects other targets or insecure TLS',()=>{
 const main='postgresql://u:p@ep-noisy-king-aunaaru0-pooler.c-10.us-east-1.aws.neon.tech/musicmesh?sslmode=verify-full';
 assert.equal(assertMainDevelopmentTarget(main).database,'musicmesh');
 assert.throws(()=>assertMainDevelopmentTarget(main.replace('verify-full','require')),/main development/);
 assert.throws(()=>assertMainDevelopmentTarget(main.replace('/musicmesh?','/other?')),/main development/);
 assert.throws(()=>assertMainDevelopmentTarget(main.replace('ep-noisy-king-aunaaru0','ep-flat-glitter-au4xn3l9')),/main development/);
 assert.throws(()=>assertIsolatedTarget(main),/isolated/,'main remains opt-in, never an isolated fallback');
});
