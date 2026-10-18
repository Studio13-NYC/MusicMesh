const test=require('node:test'),assert=require('node:assert/strict');
const {catalogGraph}=require('../src/import/catalogGraph');
const {catalogUrl,validateCatalog,collectCatalog}=require('../src/import/catalogClosure');
const {entityFromGraph,relationshipFromGraph}=require('../src/domain/serialization');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function release(){return {id:id(1),title:'Edition',date:'1999',barcode:'00123','release-group':{id:id(2),title:'Album'},'label-info':[{label:{id:id(3),name:'Label'},'catalog-number':'CAT1'}],
 'artist-credit':[{name:'A',joinphrase:'',artist:{id:id(4),name:'Artist'}}],media:[{position:1,format:'CD','track-count':2,tracks:[
 {id:id(5),position:1,number:'1',title:'Track title',recording:{id:id(6),title:'Recording title'},'artist-credit':[{name:'A',joinphrase:'',artist:{id:id(4),name:'Artist'}}]},
 {id:id(7),position:2,number:'2',recording:{id:id(8),title:'Context song'}}]}]};}
function response(body){return {url:catalogUrl('release',body.id),fetchedAt:'2026-10-17T00:00:00Z',body};}
test('release graph preserves edition, medium, track, recording, billing and label identities',()=>{
 const body=release();validateCatalog('release',body);
 const g=catalogGraph('release',response(body));const byId=new Map(g.nodes.map(n=>[n.id,n]));
 assert.equal(g.nodes.filter(n=>n.type==='Track').length,2);
 const track=byId.get('musicbrainz:track:'+id(5));assert.equal(track.name,'Track title');assert.equal(track.properties.recordingId,'musicbrainz:recording:'+id(6));
 assert.ok(g.relationships.some(e=>e.type==='ReleaseLabel'&&e.properties.catalogNumber==='CAT1'));
 assert.ok(g.relationships.some(e=>e.type==='EditionOf'));
 assert.ok(g.nodes.every(n=>!['ListeningEvent','IdentityMapping'].includes(n.type)));
 for(const edge of g.relationships)assert.doesNotThrow(()=>relationshipFromGraph(edge.toGraphRelationship(),byId));
 for(const node of g.nodes)assert.deepEqual(entityFromGraph(node.toGraphNode()),node);
});
test('release validation refuses truncated tracklists; pregap and data tracks retain positions',()=>{
 const body=release();body.media[0].tracks.pop();assert.throws(()=>validateCatalog('release',body),/track/);
 const complete=release();complete.media[0].pregap={id:id(9),position:0,number:'0',recording:{id:id(10),title:'Pregap'}};
 complete.media[0]['data-tracks']=[{id:id(11),position:3,number:'3',recording:{id:id(12),title:'Data'}}];
 assert.equal(catalogGraph('release',response(complete)).nodes.filter(n=>n.type==='Track').length,4);
});
test('lookup URLs stay bounded and do not request artist discography or capped release lists',()=>{
 for(const type of ['artist','work','release-group','label','area','place','instrument','event','series']){
  const url=new URL(catalogUrl(type,id(1)));assert.equal(url.hostname,'musicbrainz.org');
  assert.ok(!url.searchParams.get('inc').split('+').some(s=>['releases','release-groups','recordings','works'].includes(s)));
 }
 const inc=new URL(catalogUrl('recording',id(1))).searchParams.get('inc').split('+');
 for(const type of ['area','artist','event','genre','instrument','label','place','recording','release','release-group','series','url','work'])assert.ok(inc.includes(type+'-rels'),type);
 assert.ok(!inc.includes('releases'));assert.ok(!inc.includes('release-groups'));
 assert.throws(()=>catalogUrl('collection',id(1)),/type/);
 assert.throws(()=>catalogUrl('artist','bad'),/MBID/);
});
test('catalog collection shares the recording lock, resumes cached requests and has finite closure',async t=>{
 const fs=require('node:fs'),path=require('node:path'),{prepareHistory}=require('../src/import/history'),{sha256}=require('../src/import/history');
 const {ProviderCache,recordingUrl}=require('../src/import/providerCache');
 const root=path.join(__dirname,'..','output','tests');fs.mkdirSync(root,{recursive:true});const dir=fs.mkdtempSync(path.join(root,'closure-'));t.after(()=>fs.rmSync(dir,{recursive:true}));
 const prepared=path.join(dir,'prepared'),cache=path.join(dir,'cache');fs.mkdirSync(path.join(cache,'responses'),{recursive:true});
 fs.writeFileSync(path.join(dir,'source.csv'),'uts,artist,album,track\n1700000000,A,B,C\n');
 fs.writeFileSync(path.join(dir,'export.json'),JSON.stringify([{listened_at:1700000000,track_metadata:{artist_name:'A',release_name:'B',track_name:'C',mbid_mapping:{recording_mbid:id(6),release_mbid:id(1)}}}]));
 prepareHistory({sourcePath:path.join(dir,'source.csv'),account:'a',outputDir:prepared,listenbrainzPath:path.join(dir,'export.json'),listenbrainzAccount:'a'});
 const url=recordingUrl(id(6)),body={id:id(6),title:'C',relations:[{'target-type':'work',work:{id:id(20),title:'Work'},direction:'forward',type:'performance','type-id':id(21)}]};
 fs.writeFileSync(path.join(cache,'responses',sha256(url)+'.json'),JSON.stringify({url,fetchedAt:'2026-10-17T00:00:00Z',status:'ok',body,bodyHash:sha256(JSON.stringify(body))}));
 let calls=0;const client=new ProviderCache({dir:path.join(cache,'responses'),sleep:async()=>{},fetchImpl:async url=>{
  calls++;const [type,mbid]=new URL(url).pathname.split('/').slice(-2);let body=type==='release'?release():{id:mbid,name:type,title:type};
  if(type==='artist')body.relations=[{'target-type':'artist',artist:{id:id(99),name:'Outside'},direction:'forward',type:'member of band','type-id':id(98)}];
  if(type==='recording')body={id:mbid,title:'C',length:123000,relations:[{'target-type':'place',place:{id:id(30),name:'Studio'},direction:'forward',type:'recorded at','type-id':id(31)}]};
  return new Response(JSON.stringify(body));}});
 fs.writeFileSync(path.join(cache,'fetch.lock'),JSON.stringify({pid:process.pid}));
 await assert.rejects(()=>collectCatalog({preparedDir:prepared,cacheDir:cache,client}),/worker|lock/);fs.unlinkSync(path.join(cache,'fetch.lock'));
 const first=await collectCatalog({preparedDir:prepared,cacheDir:cache,client});assert.equal(first.state,'complete');assert.equal(first.requested,7);
 assert.equal(first.requests.filter(r=>r.type==='recording').length,1);
 assert.ok(first.requests.some(r=>r.type==='place'&&r.id===id(30)));
 assert.ok(!first.requests.some(r=>r.type==='recording'&&r.id===id(8)),'sibling tracks are not additional recording seeds');
 assert.equal(first.requests.some(r=>r.id===id(99)),false);assert.equal(first.databaseWritten,false);
 const before=calls;const resumed=await collectCatalog({preparedDir:prepared,cacheDir:cache,client});assert.equal(calls,before);assert.deepEqual(resumed.requests,first.requests);
 const checkpointDir=path.join(dir,'checkpoint');
 const liveProgress=fs.readFileSync(path.join(cache,'catalog-progress.json'));
 fs.writeFileSync(path.join(cache,'fetch.lock'),JSON.stringify({pid:process.pid}));
 const missingUrl=catalogUrl('place',id(30)),missingPath=path.join(cache,'responses',sha256(missingUrl)+'.json');
 const missingBytes=fs.readFileSync(missingPath);fs.unlinkSync(missingPath);
 const checkpoint=await require('../src/import/catalogClosure').checkpointCatalog({preparedDir:prepared,cacheDir:cache,outputDir:checkpointDir});
 assert.equal(checkpoint.state,'incomplete');assert.equal(checkpoint.pending,1);assert.equal(checkpoint.ok,6);
 assert.equal(calls,before);assert.deepEqual(fs.readFileSync(path.join(cache,'catalog-progress.json')),liveProgress);
 assert.ok(fs.existsSync(path.join(cache,'fetch.lock')),'checkpoint must not touch the live worker lock');
 fs.writeFileSync(missingPath,missingBytes);fs.unlinkSync(path.join(cache,'fetch.lock'));
 // Newly completed responses must not silently enter a frozen checkpoint.
 const checkpointResponses=require('../src/import/catalogClosure').readCatalogResponses(cache,JSON.parse(fs.readFileSync(path.join(prepared,'manifest.json'))),[id(6)],checkpointDir);
 assert.equal(checkpointResponses.responses.length,6);
 const checkpointSnapshot=path.join(dir,'checkpoint-snapshot');
 require('../src/import/graphSnapshot').compileSnapshot({preparedDir:prepared,cacheDir:cache,outputDir:checkpointSnapshot,catalogManifestDir:checkpointDir});
 const checkpointGraph=require('../src/import/graphSnapshot').readSnapshot(checkpointSnapshot);
 assert.equal(checkpointGraph.manifest.catalog.pending,1);assert.equal(checkpointGraph.manifest.catalog.state,'incomplete');
 assert.equal(checkpointGraph.nodes.filter(n=>n.type==='Track').length,2);

 const {compileSnapshot,readSnapshot}=require('../src/import/graphSnapshot');const dest=path.join(dir,'snapshot');
 compileSnapshot({preparedDir:prepared,cacheDir:cache,outputDir:dest,includeCatalog:true});const graph=readSnapshot(dest);
 assert.equal(graph.nodes.filter(n=>n.type==='Track').length,2);assert.equal(graph.nodes.filter(n=>n.type==='ListeningEvent').length,1);
 assert.equal(graph.manifest.catalog.state,'complete');
 const audio=graph.nodes.find(n=>n.id==='musicbrainz:recording:'+id(6));
 assert.equal(audio.properties.durationMs,123000);
 assert.ok(audio.properties.rawProvider.relations.some(r=>r['target-type']==='place'),'full lookup becomes canonical recording payload');
 assert.ok(graph.relationships.some(r=>r.type==='MusicBrainzRelationship'&&r.target==='musicbrainz:place:'+id(30)));
 const seedFile=path.join(cache,'responses',sha256(url)+'.json'),original=fs.readFileSync(seedFile);
 const changed=JSON.parse(original);changed.body.title='New evidence';changed.bodyHash=sha256(JSON.stringify(changed.body));fs.writeFileSync(seedFile,JSON.stringify(changed));
 assert.throws(()=>compileSnapshot({preparedDir:prepared,cacheDir:cache,outputDir:path.join(dir,'stale'),includeCatalog:true}),/seed.*changed/);
 fs.writeFileSync(seedFile,original);
 const limited=await collectCatalog({preparedDir:prepared,cacheDir:cache,client,limit:1});assert.equal(limited.state,'limited');assert.equal(limited.requested,1);
 fs.writeFileSync(path.join(cache,'fetch.lock'),JSON.stringify({pid:123}));t.mock.method(process,'kill',()=>true);let waits=0;
 await collectCatalog({preparedDir:prepared,cacheDir:cache,client,limit:1,waitForLock:true,wait:async()=>{waits++;fs.unlinkSync(path.join(cache,'fetch.lock'));}});assert.equal(waits,1);
 const bad=JSON.parse(fs.readFileSync(path.join(cache,'catalog-manifest.json')));bad.input.sourceHash='wrong';fs.writeFileSync(path.join(cache,'catalog-manifest.json'),JSON.stringify(bad));
 assert.throws(()=>compileSnapshot({preparedDir:prepared,cacheDir:cache,outputDir:path.join(dir,'bad'),includeCatalog:true}),/identity/);
});
