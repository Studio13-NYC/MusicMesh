const fs=require('node:fs');
const path=require('node:path');
const domain=require('../domain');
const {entityFromGraph,relationshipFromGraph}=require('../domain/serialization');
const {sha256}=require('./history');
const {recordingUrl}=require('./providerCache');
const {recordingGraph}=require('./catalogGraph');
function readLines(bytes){return bytes.toString('utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);}
function checkedFile(dir,manifest,name){
  const bytes=fs.readFileSync(path.join(dir,name));
  if(sha256(bytes)!==manifest.files[name])throw new Error(`Snapshot checksum mismatch: ${name}`);
  return bytes;
}
function compileSnapshot({preparedDir,cacheDir,outputDir,acousticDir,includeCatalog=false}){
  const prepared=JSON.parse(fs.readFileSync(path.join(preparedDir,'manifest.json')));
  const events=readLines(checkedFile(preparedDir,prepared,'events.ndjson')).map(entityFromGraph);
  const mappings=readLines(checkedFile(preparedDir,prepared,'mappings.ndjson')).map(entityFromGraph);
  const recordingIds=JSON.parse(checkedFile(preparedDir,prepared,'recording-mbids.json'));
  const nodes=new Map(),edges=new Map();
  function rank(node){return {lookup:3,embedded:2,'provider-mapped':1}[node.properties.hydrationStatus] || 0;}
  function addNode(node){const previous=nodes.get(node.id);if(previous && previous.type!==node.type)throw new Error('Conflicting domain types');if(!previous || rank(node)>rank(previous))nodes.set(node.id,node);}
  function addEdge(edge){
    const previous=edges.get(edge.id);
    if(previous && edge.type==='MusicBrainzRelationship'){
      const observations=[...(previous.properties.observations || [{evidence:previous.properties.providerEvidence,assertion:previous.properties.rawProvider}]),{evidence:edge.properties.providerEvidence,assertion:edge.properties.rawProvider}];
      edge=new domain.MusicBrainzRelationship({source:nodes.get(edge.source),target:nodes.get(edge.target),assertionKey:edge.assertionKey,properties:{...previous.properties,observations}});
    }
    edges.set(edge.id,edge);
  }
  events.forEach(addNode);
  for(const mapping of mappings){
    addNode(mapping);
    addEdge(new domain.HasMapping({source:nodes.get(mapping.properties.sourceId),target:mapping,assertionKey:'source-mapping',properties:{source:'listenbrainz'}}));
    if(!mapping.properties.targetId)continue;
    const id=mapping.properties.targetId.slice('musicbrainz:recording:'.length);
    const match=mapping.properties.providerEvidence.find(x=>x.track_metadata?.mbid_mapping?.recording_mbid?.toLowerCase()===id)?.track_metadata.mbid_mapping;
    if(!match)throw new Error('Mapping has no supporting provider identity');
    const recording=new domain.Recording({externalId:{provider:'musicbrainz',type:'recording',value:id},name:match.recording_name || nodes.get(mapping.properties.sourceId).properties.submittedTitle,
      properties:{source:'listenbrainz',evidenceBasis:'provider-mapping',hydrationStatus:'provider-mapped',nameBasis:match.recording_name?'provider-name':'submitted-title'}});
    addNode(recording);
    addEdge(new domain.MapsToRecording({source:mapping,target:recording,assertionKey:'provider-match',properties:{source:'listenbrainz'}}));
  }
  const recordingLookups={requested:recordingIds.length,retrieved:0,pending:0,notFound:0,errors:0,redirects:0};
  for(const id of recordingIds){
    const url=recordingUrl(id),file=path.join(cacheDir,'responses',sha256(url)+'.json');
    if(!fs.existsSync(file)){recordingLookups.pending++;continue;}
    const response=JSON.parse(fs.readFileSync(file));
    if(response.url!==url)throw new Error('Provider cache URL mismatch');
    if(response.status!=='ok'){recordingLookups[response.status==='not-found'?'notFound':'errors']++;continue;}
    if(sha256(JSON.stringify(response.body))!==response.bodyHash)throw new Error('Provider response checksum mismatch');
    const graph=recordingGraph(response);graph.nodes.forEach(addNode);graph.relationships.forEach(addEdge);recordingLookups.retrieved++;
    if(response.body.id!==id){
      const source=nodes.get(`musicbrainz:recording:${id}`),target=nodes.get(`musicbrainz:recording:${response.body.id}`);
      addEdge(new domain.RedirectsTo({source,target,assertionKey:'musicbrainz-redirect',properties:{requestUrl:url,source:'musicbrainz',evidenceBasis:'provider',responseHash:response.bodyHash}}));recordingLookups.redirects++;
    }
  }
  let catalog=null;
  if(includeCatalog){
    const {manifest,responses}=require('./catalogClosure').readCatalogResponses(cacheDir,prepared,recordingIds);
    for(const {type,requestedId,response} of responses){
      const graph=require('./catalogGraph').catalogGraph(type,response);graph.nodes.forEach(addNode);graph.relationships.forEach(addEdge);
      // The second recording lookup includes every relationship category. Prefer its
      // complete payload to the earlier first-pass payload, keeping both caches as evidence.
      if(type==='recording')nodes.set(`musicbrainz:recording:${response.body.id}`,graph.nodes.find(n=>n.id===`musicbrainz:recording:${response.body.id}`));
      if(requestedId!==response.body.id){
        const original=require('./catalogGraph').providerEntity(type,{id:requestedId,title:`Redirected ${type} (${requestedId})`},{url:response.url,retrievedAt:response.fetchedAt,responseHash:response.bodyHash});addNode(original);
        addEdge(new domain.RedirectsTo({source:original,target:nodes.get(`musicbrainz:${type}:${response.body.id}`),assertionKey:'musicbrainz-redirect',properties:{requestUrl:response.url,source:'musicbrainz',responseHash:response.bodyHash}}));
      }
    }
    const recordingRequests=manifest.requests.filter(r=>r.type==='recording');
    const recordingRelationshipLookups={requested:recordingRequests.length,retrieved:recordingRequests.filter(r=>r.status==='ok').length,notFound:recordingRequests.filter(r=>r.status==='not-found').length,errors:recordingRequests.filter(r=>r.status==='error').length};
    catalog={state:manifest.state,requested:manifest.requested,retrieved:manifest.ok,notFound:manifest.notFound,errors:manifest.errors,selection:manifest.selection,excluded:manifest.excluded,recordingRelationshipIncludes:manifest.recordingRelationshipIncludes,recordingRelationshipLookups,pagination:manifest.pagination,manifestHash:sha256(JSON.stringify(manifest))};
  }
  let acoustic=null;
  if(acousticDir){const graph=require('./acousticSimilarity').readAcousticGraph(acousticDir,nodes,prepared);graph.nodes.forEach(addNode);graph.relationships.forEach(addEdge);acoustic=graph.receipt;}
  fs.mkdirSync(outputDir,{recursive:true});
  if(fs.readdirSync(outputDir).length)throw new Error('Snapshot output must be empty');
  const files={};
  for(const [name,objects] of [['nodes.ndjson',[...nodes.values()].map(n=>n.toGraphNode())],['relationships.ndjson',[...edges.values()].map(e=>e.toGraphRelationship())]]){
    const bytes=objects.map(o=>JSON.stringify(o)).join('\n')+'\n';fs.writeFileSync(path.join(outputDir,name),bytes,{flag:'wx'});files[name]=sha256(bytes);
  }
  const counts={};for(const node of nodes.values())counts[node.type]=(counts[node.type]||0)+1;
  const manifest={version:1,ontologyVersion:domain.getOntology().version,createdAt:new Date().toISOString(),sourceInput:prepared.input,
    databaseWritten:false,counts,nodes:nodes.size,relationships:edges.size,recordingLookups,catalog,acoustic,files};
  fs.writeFileSync(path.join(outputDir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  return manifest;
}
function readSnapshot(directory){
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json')));
  if(manifest.version!==1 || manifest.ontologyVersion!==domain.getOntology().version)throw new Error('Unsupported snapshot/ontology version');
  const nodes=readLines(checkedFile(directory,manifest,'nodes.ndjson')).map(entityFromGraph);
  const byId=new Map(nodes.map(n=>[n.id,n]));
  const relationships=readLines(checkedFile(directory,manifest,'relationships.ndjson')).map(e=>relationshipFromGraph(e,byId));
  if(nodes.length!==manifest.nodes || byId.size!==nodes.length || relationships.length!==manifest.relationships || new Set(relationships.map(e=>e.id)).size!==relationships.length)throw new Error('Snapshot count/identity mismatch');
  return {manifest,nodes,relationships};
}
function assertIsolatedTarget(connectionString){
  const url=new URL(connectionString);
  const neon=['ep-flat-glitter-au4xn3l9-pooler.c-10.us-east-1.aws.neon.tech','ep-flat-glitter-au4xn3l9.c-10.us-east-1.aws.neon.tech'];
  if(!((neon.includes(url.hostname) && url.pathname==='/musicmesh' && url.searchParams.get('sslmode')==='verify-full') || (url.hostname==='127.0.0.1' && url.port==='55433' && url.pathname==='/musicmesh_restore')))throw new Error('Import requires the explicitly selected isolated MusicMesh validation database');
  return {host:url.hostname,database:url.pathname.slice(1)};
}
function assertMainDevelopmentTarget(connectionString){
  const url=new URL(connectionString);
  const hosts=['ep-noisy-king-aunaaru0-pooler.c-10.us-east-1.aws.neon.tech','ep-noisy-king-aunaaru0.c-10.us-east-1.aws.neon.tech'];
  if(!hosts.includes(url.hostname)||url.pathname!=='/musicmesh'||url.searchParams.get('sslmode')!=='verify-full')throw new Error('Import requires the explicitly selected MusicMesh main development database');
  return {host:url.hostname,database:url.pathname.slice(1)};
}
async function loadSnapshot({directory,replace=false,onProgress=()=>{},target,receiptName}){
  const graph=readSnapshot(directory);
  const {getDatabase}=require('../postgres'),{persistDomainBatch}=require('../domain/repository');
  const db=getDatabase();
  const identity=await db.$queryRaw`SELECT current_database() AS database`;
  if(identity[0].database!==target.database)throw new Error('Connected database identity differs');
  if(replace)await db.$transaction(async tx=>{await tx.$queryRaw`SELECT pg_advisory_xact_lock(73130908)::text`;await tx.relationship.deleteMany();await tx.entity.deleteMany();await tx.importBatch.deleteMany();},{timeout:30000});
  const receipt={target,state:'loading',createdNodes:0,createdRelationships:0,verifiedNodes:0,verifiedRelationships:0,snapshotFiles:graph.manifest.files,
    enrichment:{recordings:graph.manifest.recordingLookups,catalog:graph.manifest.catalog||null,acoustic:graph.manifest.acoustic||null}};
  const receiptPath=path.join(directory,receiptName);
  try {
    for(const [key,objects] of [['nodes',graph.nodes],['relationships',graph.relationships]])for(let i=0;i<objects.length;i+=200){
      const result=await persistDomainBatch(db,{[key]:objects.slice(i,i+200)});
      for(const field of ['createdNodes','createdRelationships','verifiedNodes','verifiedRelationships'])receipt[field]+=result[field];
      if(i%2000===0)onProgress({...receipt});
    }
    receipt.state='verified';receipt.verifiedAt=new Date().toISOString();
    await db.importBatch.upsert({where:{sourceHash:sha256(JSON.stringify(graph.manifest.files))},create:{sourceHash:sha256(JSON.stringify(graph.manifest.files)),nodes:graph.nodes.length,relationships:graph.relationships.length},update:{}});
    fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n');return receipt;
  }catch(error){receipt.state='incomplete';fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n');throw error;}
}
function loadIsolatedSnapshot(options){
  // Check before importing postgres/env: an absent explicit target cannot select main.
  return loadSnapshot({...options,target:assertIsolatedTarget(process.env.DATABASE_URL),receiptName:'isolated-import-receipt.json'});
}
function loadMainDevelopmentSnapshot(options){
  const target=assertMainDevelopmentTarget(process.env.DATABASE_URL);
  require('./snapshotAudit').auditSnapshot({directory:options.directory,preparedDir:options.preparedDir});
  return loadSnapshot({...options,target,receiptName:'main-development-import-receipt.json'});
}
module.exports={compileSnapshot,readSnapshot,assertIsolatedTarget,assertMainDevelopmentTarget,loadIsolatedSnapshot,loadMainDevelopmentSnapshot};
