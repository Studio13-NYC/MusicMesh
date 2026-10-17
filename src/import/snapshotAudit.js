const fs=require('node:fs'),path=require('node:path');
const domain=require('../domain');
const {canonicalJson,entityFromGraph}=require('../domain/serialization');
const {sha256}=require('./history');
const {readSnapshot}=require('./graphSnapshot');

/** Read-only integrity audit. Collection completion is not database or product verification. */
function auditSnapshot({directory,preparedDir}){
 const graph=readSnapshot(directory),manifest=graph.manifest;
 const prepared=JSON.parse(fs.readFileSync(path.join(preparedDir,'manifest.json')));
 if(canonicalJson(manifest.sourceInput)!==canonicalJson(prepared.input))throw new Error('Snapshot source identity differs from prepared history');
 function readPrepared(name){
  const bytes=fs.readFileSync(path.join(preparedDir,name));
  if(sha256(bytes)!==prepared.files[name])throw new Error('Prepared source checksum mismatch: '+name);
  return bytes.toString('utf8');
 }
 const events=readPrepared('events.ndjson').trim().split('\n').filter(Boolean).map(JSON.parse).map(entityFromGraph);
 const mappings=readPrepared('mappings.ndjson').trim().split('\n').filter(Boolean).map(JSON.parse).map(entityFromGraph);
 const ids=JSON.parse(readPrepared('recording-mbids.json'));
 const nodes=new Map(graph.nodes.map(n=>[n.id,n])),edges=new Map(graph.relationships.map(e=>[e.id,e]));
 const counts={};for(const node of graph.nodes)counts[node.type]=(counts[node.type]||0)+1;
 if(canonicalJson(counts)!==canonicalJson(manifest.counts))throw new Error('Snapshot class counts differ from actual objects');
 function verifySources(originals,type,label){
  if((counts[type]||0)!==originals.length||new Set(originals.map(n=>n.id)).size!==originals.length)throw new Error('Snapshot '+label+' count mismatch');
  for(const original of originals)if(canonicalJson(nodes.get(original.id)?.toGraphNode())!==canonicalJson(original.toGraphNode()))throw new Error('Snapshot '+label+' differs from prepared history: '+original.id);
 }
 verifySources(events,'ListeningEvent','source event');verifySources(mappings,'IdentityMapping','source mapping');
 const expected=[];let mappedEvents=0;
 for(const mapping of mappings){
  expected.push(new domain.HasMapping({source:nodes.get(mapping.properties.sourceId),target:mapping,assertionKey:'source-mapping',properties:{source:'listenbrainz'}}));
  if(mapping.properties.targetId){mappedEvents++;expected.push(new domain.MapsToRecording({source:mapping,target:nodes.get(mapping.properties.targetId),assertionKey:'provider-match',properties:{source:'listenbrainz'}}));}
 }
 if(graph.relationships.filter(e=>['HasMapping','MapsToRecording'].includes(e.type)).length!==expected.length)throw new Error('Snapshot mapping relationship count differs');
 for(const edge of expected)if(canonicalJson(edges.get(edge.id)?.toGraphRelationship())!==canonicalJson(edge.toGraphRelationship()))throw new Error('Snapshot mapping relationship differs from prepared history');
 if(events.length!==prepared.counts.events||mappings.length!==events.length||mappedEvents!==prepared.counts.providerMatchedEvents||ids.length!==prepared.counts.distinctRecordingMbids)throw new Error('Prepared source counts differ from objects');
 const mappedIds=[...new Set(mappings.flatMap(m=>m.properties.targetId?[m.properties.targetId.slice('musicbrainz:recording:'.length)]:[]))].sort();
 if(canonicalJson(mappedIds)!==canonicalJson([...ids].sort()))throw new Error('Prepared recording identities differ from mapping targets');
 const pending=[],recordings=manifest.recordingLookups,catalog=manifest.catalog,relationLookups=catalog?.recordingRelationshipLookups;
 if(recordings.requested!==ids.length||recordings.pending!==0||recordings.errors!==0||recordings.retrieved+recordings.notFound!==ids.length)pending.push('recording-lookups');
 const relationTypes=['area','artist','event','genre','instrument','label','place','recording','release','release-group','series','url','work'].map(t=>t+'-rels').sort();
 if(catalog?.state!=='complete'||catalog.errors!==0||relationLookups?.requested!==ids.length||relationLookups?.errors!==0||relationLookups.retrieved+relationLookups.notFound!==ids.length||canonicalJson([...(catalog?.recordingRelationshipIncludes||[])].sort())!==canonicalJson(relationTypes))pending.push('catalog-closure');
 if(manifest.acoustic?.featureCollectionState!=='complete')pending.push('acoustic-features');
 const fileBytes={};for(const name of Object.keys(manifest.files))fileBytes[name]=fs.statSync(path.join(directory,name)).size;
 return {version:1,auditedAt:new Date().toISOString(),ontologyVersion:manifest.ontologyVersion,sourceInput:manifest.sourceInput,
  sourceEvents:events.length,mappedEvents,unresolvedEvents:events.length-mappedEvents,distinctMappedRecordings:ids.length,
  nodes:graph.nodes.length,relationships:graph.relationships.length,counts,snapshotFiles:manifest.files,fileBytes,
  collectionComplete:pending.length===0,pending,enrichment:{recordings,catalog:catalog||null,acoustic:manifest.acoustic||null},databaseVerified:false,databaseWritten:false,
  limitation:'Serialized file sizes are not PostgreSQL storage estimates. Database replay, capacity and actual workbench verification are separate requirements.'};
}
module.exports={auditSnapshot};
