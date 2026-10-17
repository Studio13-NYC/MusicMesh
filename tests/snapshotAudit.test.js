const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {prepareHistory,sha256}=require('../src/import/history');
const {compileSnapshot}=require('../src/import/graphSnapshot');
const {auditSnapshot}=require('../src/import/snapshotAudit');
function fixture(t){
 const root=path.join(__dirname,'..','output','tests');fs.mkdirSync(root,{recursive:true});
 const dir=fs.mkdtempSync(path.join(root,'audit-'));t.after(()=>fs.rmSync(dir,{recursive:true}));
 const preparedDir=path.join(dir,'prepared'),directory=path.join(dir,'snapshot');
 const sourcePath=path.join(dir,'source.csv');fs.writeFileSync(sourcePath,'uts,artist,album,track\n1700000000,A,B,C\n1700000001,A,B,D\n');
 const exportPath=path.join(dir,'export.json');fs.writeFileSync(exportPath,JSON.stringify([{listened_at:1700000000,track_metadata:{artist_name:'A',release_name:'B',track_name:'C',mbid_mapping:{recording_mbid:'bf7c0045-d389-4ef9-9df4-0a375000076c'}}}]));
 prepareHistory({sourcePath,account:'a',outputDir:preparedDir,listenbrainzPath:exportPath,listenbrainzAccount:'a'});
 compileSnapshot({preparedDir,cacheDir:path.join(dir,'cache'),outputDir:directory});
 return {directory,preparedDir};
}
function changeManifest(directory,fn){const p=path.join(directory,'manifest.json'),m=JSON.parse(fs.readFileSync(p));fn(m);fs.writeFileSync(p,JSON.stringify(m));}
test('snapshot audit verifies original plays and mappings but keeps incomplete enrichment ineligible',t=>{
 const f=fixture(t),before=fs.readdirSync(f.directory);const result=auditSnapshot(f);
 assert.equal(result.sourceEvents,2);assert.equal(result.mappedEvents,1);assert.equal(result.unresolvedEvents,1);
 assert.equal(result.collectionComplete,false);assert.deepEqual(result.pending,['recording-lookups','catalog-closure','acoustic-features']);
 assert.equal(result.databaseWritten,false);assert.equal(result.databaseVerified,false);
 assert.deepEqual(fs.readdirSync(f.directory),before,'audit itself writes no artifact or database');
});
test('audit rejects modified source events even if snapshot checksums are recomputed',t=>{
 const f=fixture(t),p=path.join(f.directory,'nodes.ndjson');
 const rows=fs.readFileSync(p,'utf8').trim().split('\n').map(JSON.parse);
 rows.find(n=>n.labels.includes('ListeningEvent')).properties.submittedTitle='Changed title';
 const bytes=rows.map(JSON.stringify).join('\n')+'\n';fs.writeFileSync(p,bytes);
 changeManifest(f.directory,m=>m.files['nodes.ndjson']=sha256(bytes));
 assert.throws(()=>auditSnapshot(f),/source event/i);
});
test('audit rejects forged class counts, source identity and missing mapping relationships',t=>{
 const f=fixture(t),manifestPath=path.join(f.directory,'manifest.json'),original=fs.readFileSync(manifestPath);
 changeManifest(f.directory,m=>m.counts.ListeningEvent=999);assert.throws(()=>auditSnapshot(f),/class counts/i);
 fs.writeFileSync(manifestPath,original);changeManifest(f.directory,m=>m.sourceInput.account='other');assert.throws(()=>auditSnapshot(f),/source identity/i);
 fs.writeFileSync(manifestPath,original);
 const p=path.join(f.directory,'relationships.ndjson'),rows=fs.readFileSync(p,'utf8').trim().split('\n').map(JSON.parse).filter(r=>r.type!=='MapsToRecording');
 const bytes=rows.map(JSON.stringify).join('\n')+'\n';fs.writeFileSync(p,bytes);
 changeManifest(f.directory,m=>{m.relationships=rows.length;m.files['relationships.ndjson']=sha256(bytes);});
 assert.throws(()=>auditSnapshot(f),/mapping relationship/i);
});
test('audit reconciles the prepared recording list with actual mapping targets',t=>{
 const f=fixture(t),p=path.join(f.preparedDir,'recording-mbids.json'),bytes=JSON.stringify(['00000000-0000-4000-8000-000000000001']);
 fs.writeFileSync(p,bytes);changeManifest(f.preparedDir,m=>m.files['recording-mbids.json']=sha256(bytes));
 assert.throws(()=>auditSnapshot(f),/recording identities/i);
});
test('completed requests can include explicit unavailable recordings without implying database verification',t=>{
 const f=fixture(t);
 changeManifest(f.directory,m=>{
  m.recordingLookups={requested:1,retrieved:0,pending:0,notFound:1,errors:0,redirects:0};
  m.catalog={state:'complete',errors:0,recordingRelationshipLookups:{requested:1,retrieved:0,notFound:1,errors:0},recordingRelationshipIncludes:['area','artist','event','genre','instrument','label','place','recording','release','release-group','series','url','work'].map(t=>t+'-rels')};
  m.acoustic={featureCollectionState:'complete',analyses:0,comparisons:0,cohorts:0};
 });
 const report=auditSnapshot(f);assert.equal(report.collectionComplete,true);assert.equal(report.databaseVerified,false);
 assert.equal(report.enrichment.recordings.notFound,1);
 changeManifest(f.directory,m=>m.catalog.recordingRelationshipLookups.notFound=0);
 assert.equal(auditSnapshot(f).collectionComplete,false,'contradictory request counts cannot establish completion');
});
