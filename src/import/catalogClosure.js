const fs=require('node:fs'),path=require('node:path');
const {ProviderCache,recordingUrl,validateRecording,atomicJson}=require('./providerCache');
const {sha256}=require('./history');
const MBID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rels='artist-rels+area-rels+place-rels+url-rels+instrument-rels+event-rels+label-rels+series-rels';
const includes={recording:'artist-credits+genres+tags+isrcs+annotation+recording-rels+work-rels+release-rels+release-group-rels+genre-rels+'+rels,
 release:'recordings+artist-credits+release-groups+labels+isrcs+genres+tags+'+rels,
 artist:'aliases+genres+tags+'+rels,work:'aliases+genres+tags+work-rels+'+rels,
 'release-group':'artist-credits+genres+tags+'+rels,label:'aliases+genres+tags+'+rels,
 area:'aliases+area-rels+url-rels',place:'aliases+area-rels+place-rels+url-rels',
 instrument:'aliases+instrument-rels+url-rels',event:rels,series:'url-rels'};
function catalogUrl(type,id){
 if(!Object.hasOwn(includes,type))throw new Error('Unsupported catalog lookup type');
 if(typeof id!=='string'||!MBID.test(id))throw new Error('Invalid catalog MBID');
 const u=new URL('https://musicbrainz.org/ws/2/'+type+'/'+id.toLowerCase());u.searchParams.set('fmt','json');u.searchParams.set('inc',includes[type]);return u.href;
}
function validateCatalog(type,body){
 if(type==='recording')return validateRecording(body);
 if(!body||!MBID.test(body.id||'')||typeof (body.title||body.name)!=='string')throw new Error('Invalid catalog lookup body');
 if(type!=='release')return;
 if(!Array.isArray(body.media))throw new Error('Release media missing');
 const trackIds=new Set(),positions=new Set();
 for(const m of body.media){
  if(!Number.isSafeInteger(m.position)||m.position<1||positions.has(m.position))throw new Error('Invalid medium position');positions.add(m.position);
  if(!Array.isArray(m.tracks)||!Number.isSafeInteger(m['track-count'])||m['track-count']!==m.tracks.length)throw new Error('Incomplete release tracklist');
  const trackPositions=new Set();
  for(const t of [...(m.pregap?[m.pregap]:[]),...m.tracks,...(m['data-tracks']||[])]){
   if(!MBID.test(t.id||'')||trackIds.has(t.id)||!Number.isSafeInteger(t.position)||t.position<0||trackPositions.has(t.position)||!MBID.test(t.recording?.id||'')||typeof t.recording?.title!=='string')throw new Error('Invalid release track identity/position');
   trackIds.add(t.id);trackPositions.add(t.position);
  }
 }
}
function checkedPrepared(dir,name,manifest){const bytes=fs.readFileSync(path.join(dir,name));if(sha256(bytes)!==manifest.files[name])throw new Error('Prepared catalog source checksum mismatch');return bytes;}
function cachedResponse(cacheDir,url,validate){
 const file=path.join(cacheDir,'responses',sha256(url)+'.json');if(!fs.existsSync(file))return null;
 const r=JSON.parse(fs.readFileSync(file));if(r.url!==url)throw new Error('Catalog cache URL mismatch');
 if(r.status==='ok'){if(r.bodyHash!==sha256(JSON.stringify(r.body)))throw new Error('Catalog cache checksum mismatch');validate(r.body);}
 else if(!['not-found','error'].includes(r.status))throw new Error('Invalid catalog cache status');return r;
}
async function collectCatalog({preparedDir,cacheDir,limit=Infinity,waitForLock=false,client:providedClient,cachedOnly=false,outputDir,onProgress=()=>{},wait=ms=>new Promise(resolve=>setTimeout(resolve,ms))}){
 if(limit!==Infinity&&(!Number.isSafeInteger(limit)||limit<1))throw new Error('limit must be a positive integer');
 if(cachedOnly){
  if(!outputDir||path.resolve(outputDir)===path.resolve(cacheDir))throw new Error('Cache checkpoint requires a separate empty output directory');
  fs.mkdirSync(outputDir,{recursive:true});if(fs.readdirSync(outputDir).length)throw new Error('Catalog checkpoint output must be empty');
 }else fs.mkdirSync(cacheDir,{recursive:true});
 const lock=path.join(cacheDir,'fetch.lock'),progressFile=path.join(cacheDir,'catalog-progress.json');
 const save=p=>{const value={...p,updatedAt:new Date().toISOString(),databaseWritten:false};if(!cachedOnly)atomicJson(progressFile,value);onProgress(value);};
 while(!cachedOnly){
  try{fs.writeFileSync(lock,JSON.stringify({pid:process.pid,phase:'catalog-closure',startedAt:new Date().toISOString()}),{flag:'wx'});break;}
  catch(error){if(error.code!=='EEXIST')throw error;if(!waitForLock)throw new Error('MusicBrainz worker lock exists');
   const owner=JSON.parse(fs.readFileSync(lock));if(!Number.isSafeInteger(owner.pid)||owner.pid<1)throw new Error('Invalid worker lock');
   try{process.kill(owner.pid,0);}catch{throw new Error('Stale worker lock; inspect its process before removing it');}
   if(owner.pid===process.pid)throw new Error('Cannot wait for own worker lock');save({phase:'catalog-closure',state:'waiting',waitingForPid:owner.pid});await wait(30000);
  }
 }
  const client=cachedOnly?{get:async(url,validate)=>cachedResponse(cacheDir,url,validate)||{status:'pending'}}:providedClient||new ProviderCache({dir:path.join(cacheDir,'responses')});
  if(!cachedOnly&&!providedClient)client.nextRequestAt=Date.now()+1100;
 let manifest;
 try{
  const prepared=JSON.parse(fs.readFileSync(path.join(preparedDir,'manifest.json')));
  const mappings=checkedPrepared(preparedDir,'mappings.ndjson',prepared).toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
  const ids=JSON.parse(checkedPrepared(preparedDir,'recording-mbids.json',prepared));
  const initial=new Map(),releases=new Map(),recordings=new Map(),contexts=new Map(),recordingEvidence=[];
  const add=(map,type,id)=>{catalogUrl(type,id);map.set(type+':'+id.toLowerCase(),{type,id:id.toLowerCase()});};
  for(const m of mappings)for(const e of m.properties.providerEvidence||[]){const id=e.track_metadata?.mbid_mapping?.release_mbid;if(id)add(releases,'release',id);}
  for(const id of ids){
   add(recordings,'recording',id);
   const r=cachedResponse(cacheDir,recordingUrl(id),validateRecording);if(!r)throw new Error('Recording pass still has pending lookups');
   recordingEvidence.push({id,status:r.status,...(r.bodyHash?{responseHash:r.bodyHash}:{})});if(r.status!=='ok')continue;
   for(const c of r.body['artist-credit']||[])add(initial,'artist',c.artist.id);
   for(const relation of r.body.relations||[])if(['artist','work'].includes(relation['target-type']))add(initial,relation['target-type'],relation[relation['target-type']].id);
   for(const relation of r.body.relations||[])if(['label','area','place','instrument','event','series'].includes(relation['target-type']))add(contexts,relation['target-type'],relation[relation['target-type']].id);
  }
  manifest={version:2,phase:'catalog-closure',state:'running',input:prepared.input,recordingListHash:prepared.files['recording-mbids.json'],recordingEvidence,
   selection:'ListenBrainz-selected release editions; all relationship categories on mapped listened recordings; direct artists/works; release groups and billed artists; one layer of referenced non-discography context',
   excluded:['all editions of a release group','artist discographies','recursive related artist/work expansion','claim that selected edition was listened','lookup of outside recording/release/genre relationship targets unless independently selected'],
   recordingRelationshipIncludes:includes.recording.split('+').filter(x=>x.endsWith('-rels')),
   pagination:'Exact entity lookups and complete edition tracklists; no capped entity-list subquery or browse request is used',requested:0,ok:0,notFound:0,errors:0,pending:0,requests:[],databaseWritten:false,checkpointMode:cachedOnly?'cache-only':'collection'};
  const seen=new Set();let failures=0,limited=false;
  async function phase(queue,expand){
   for(const item of [...queue.values()].sort((a,b)=>(a.type+':'+a.id).localeCompare(b.type+':'+b.id))){
    const key=item.type+':'+item.id;if(seen.has(key))continue;
    if(manifest.requested>=limit){limited=true;return;}seen.add(key);
    const url=catalogUrl(item.type,item.id),r=await client.get(url,body=>validateCatalog(item.type,body));
    const request={...item,url,status:r.status,...(r.bodyHash?{responseHash:r.bodyHash}:{}),...(r.reason?{reason:r.reason}:{})};manifest.requests.push(request);manifest.requested++;
    if(r.status==='ok'){
     manifest.ok++;failures=0;
     if(expand){const graph=require('./catalogGraph').catalogGraph(item.type,r);
      for(const n of graph.nodes){const type=n.externalId?.type;if(!type)continue;
       if((expand==='release'&&['artist','work','release-group'].includes(type))||(expand==='recording'&&['artist','work'].includes(type)))add(initial,type,n.externalId.value);
       if(['label','area','place','instrument','event','series'].includes(type))add(contexts,type,n.externalId.value);
      }
     }
    }else if(r.status==='pending'){manifest.pending++;failures=0;}else if(r.status==='not-found'){manifest.notFound++;failures=0;}else{manifest.errors++;failures++;}
    save({phase:manifest.phase,state:manifest.state,stage:expand||'context',requested:manifest.requested,ok:manifest.ok,notFound:manifest.notFound,errors:manifest.errors,lastType:item.type,lastId:item.id});
    if(failures>=3||(r.httpStatus>=400&&r.httpStatus<500&&![404,429].includes(r.httpStatus)))throw new Error('Catalog requests failing; cache preserved for resumption');
   }
  }
  await phase(recordings,'recording');if(!limited)await phase(releases,'release');if(!limited)await phase(initial,'direct');if(!limited)await phase(contexts,null);
  manifest.state=limited?'limited':manifest.errors||manifest.pending||recordingEvidence.some(e=>e.status==='error')?'incomplete':'complete';
  manifest.seedCounts={releases:releases.size,recordings:recordings.size,direct:initial.size,context:contexts.size};
  manifest.completedAt=new Date().toISOString();atomicJson(path.join(cachedOnly?outputDir:cacheDir,'catalog-manifest.json'),manifest);save({phase:manifest.phase,state:manifest.state,requested:manifest.requested,ok:manifest.ok,notFound:manifest.notFound,errors:manifest.errors});return manifest;
 }catch(error){save({phase:'catalog-closure',state:'interrupted',requested:manifest?.requested||0,errors:manifest?.errors||0,reason:error.message});throw error;}
 finally{if(!cachedOnly)fs.unlinkSync(lock);}
}
function checkpointCatalog(options){return collectCatalog({...options,cachedOnly:true});}
function readCatalogResponses(cacheDir,prepared,recordingIds,manifestDir=cacheDir){
 const manifest=JSON.parse(fs.readFileSync(path.join(manifestDir,'catalog-manifest.json'))),{canonicalJson}=require('../domain/serialization');
 if(manifest.version!==2||canonicalJson(manifest.input)!==canonicalJson(prepared.input)||manifest.recordingListHash!==prepared.files['recording-mbids.json'])throw new Error('Catalog manifest source identity/version mismatch; recollect closure');
 const seedIds=manifest.recordingEvidence.map(e=>e.id);
 if(canonicalJson([...seedIds].sort())!==canonicalJson([...recordingIds].sort()))throw new Error('Catalog seed identity changed; recollect closure');
 for(const seed of manifest.recordingEvidence){
  const r=cachedResponse(cacheDir,recordingUrl(seed.id),validateRecording);
  if(!r||r.status!==seed.status||(r.status==='ok'&&r.bodyHash!==seed.responseHash))throw new Error('Catalog seed evidence changed; recollect closure');
 }
 const responses=[],seen=new Set();
 for(const request of manifest.requests){
  const url=catalogUrl(request.type,request.id);if(url!==request.url||seen.has(url))throw new Error('Invalid duplicate catalog request');seen.add(url);
  if(request.status==='pending'){if(manifest.checkpointMode!=='cache-only')throw new Error('Pending catalog request requires a cache checkpoint');continue;}
  const r=cachedResponse(cacheDir,url,body=>validateCatalog(request.type,body));
  if(!r||r.status!==request.status||(r.status==='ok'&&r.bodyHash!==request.responseHash))throw new Error('Catalog response differs from manifest');
  if(r.status==='ok')responses.push({type:request.type,requestedId:request.id,response:r});
 }
 if(manifest.requested!==seen.size||manifest.ok!==responses.length||(manifest.pending||0)!==manifest.requests.filter(r=>r.status==='pending').length)throw new Error('Catalog request count mismatch');
 return {manifest,responses};
}
module.exports={catalogUrl,validateCatalog,collectCatalog,checkpointCatalog,readCatalogResponses};
