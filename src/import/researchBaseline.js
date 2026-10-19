const fs=require('node:fs'),path=require('node:path');
const {sha256}=require('./history');
const {entityFromGraph,relationshipFromGraph,canonicalJson}=require('../domain/serialization');
const {assertOntologyVersion}=require('../domain/versions');
const {readRecords,writeRecords}=require('./snapshotFiles');

function readResearchPacket(directory){
 const dir=path.join(directory,'catalog-extension'),manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
 if(manifest.version!==1)throw new Error('Unsupported research snapshot version');
 assertOntologyVersion(manifest.ontologyVersion);
 function read(name){const bytes=fs.readFileSync(path.join(dir,name));if(sha256(bytes)!==manifest.files[name])throw new Error('Research baseline checksum mismatch: '+name);return bytes.toString('utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);}
 const nodes=read('nodes.ndjson'),relationships=read('relationships.ndjson');
 if(nodes.length!==manifest.nodes||relationships.length!==manifest.relationships||new Set(nodes.map(n=>n.id)).size!==nodes.length||new Set(relationships.map(e=>e.id)).size!==relationships.length)throw new Error('Research baseline count/identity mismatch');
 const sourceHash='operator-enrichment:'+sha256(JSON.stringify(manifest.files)+sha256(fs.readFileSync(path.join(directory,'claims.json'))));
 const receipt=JSON.parse(fs.readFileSync(path.join(directory,'main-persistence-receipt.json')));
 if(receipt.sourceHash!==sourceHash||receipt.state!=='committed')throw new Error('Mismatched committed research receipt');
 return {nodes,relationships,receipt,summary:{directory:path.resolve(directory),sourceHash,files:manifest.files,nodes:manifest.nodes,relationships:manifest.relationships}};
}

// Research was added after the bulk snapshot. Authenticate each frozen packet
// against its actual transaction receipt; never manufacture a new baseline receipt.
async function extendResearchBaseline(previous,{directories,db}){
 const nodes=new Map(previous.nodes.map(n=>[n.id,n])),relationships=new Map(previous.relationships.map(e=>[e.id,e]));
 const researchBaselines=[],seen=new Set(),pending=[];
 function add(map,object,serialize){const old=map.get(object.id);if(old&&canonicalJson(serialize(old))!==canonicalJson(serialize(object)))throw new Error('Conflicting research baseline: '+object.id);map.set(object.id,object);}
 for(const directory of directories){
  const {nodes:rawNodes,relationships:rawEdges,summary,receipt}=readResearchPacket(directory),{sourceHash}=summary;
  if(seen.has(sourceHash))throw new Error('Duplicate research baseline');seen.add(sourceHash);
  const stored=await db.importBatch.findUnique({where:{sourceHash}});
  if(receipt.sourceHash!==sourceHash||receipt.state!=='committed'||!stored||stored.nodes!==receipt.counts.nodes||stored.relationships!==receipt.counts.relationships)throw new Error('Missing or mismatched verified research import: '+directory);
  for(const row of rawNodes)add(nodes,entityFromGraph(row,{preserveOntologyVersion:true}),n=>n.toGraphNode());
  pending.push(...rawEdges);
  researchBaselines.push(summary);
 }
 for(const row of pending)add(relationships,relationshipFromGraph(row,nodes,{preserveOntologyVersion:true}),e=>e.toGraphRelationship());
 return {...previous,nodes:[...nodes.values()],relationships:[...relationships.values()],researchBaselines};
}
// Freeze a reconciled source snapshot before archiving/import. Research catalog
// rows win on overlap: collection may contain older or embedded-only metadata.
// New provider facts remain in the original compiled snapshot and source cache.
function preserveResearchSnapshot({directory,outputDir,researchDirectories}){
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json')));
 if(manifest.version!==1)throw new Error('Unsupported snapshot version');assertOntologyVersion(manifest.ontologyVersion);
 const packets=researchDirectories.map(readResearchPacket);
 if(new Set(packets.map(p=>p.summary.sourceHash)).size!==packets.length)throw new Error('Duplicate research baseline');
 fs.mkdirSync(outputDir,{recursive:true});if(fs.readdirSync(outputDir).length)throw new Error('Snapshot output must be empty');
 const files={},counts={},sizes={},preserved={};
 for(const [key,file] of [['nodes','nodes.ndjson'],['relationships','relationships.ndjson']]){
  const retained=new Map();for(const packet of packets)for(const row of packet[key]){const old=retained.get(row.id);if(old&&canonicalJson(old)!==canonicalJson(row))throw new Error('Conflicting research baseline: '+row.id);retained.set(row.id,row);}
  let count=0,overlap=0;const seen=new Set();
  function* records(){
   for(const row of readRecords(path.join(directory,file),manifest.files[file])){
    if(seen.has(row.id))throw new Error('Duplicate snapshot identity');seen.add(row.id);
    const research=retained.get(row.id);
    if(research){
     if(key==='nodes'?canonicalJson(research.labels)!==canonicalJson(row.labels):research.type!==row.type||research.source!==row.source||research.target!==row.target)throw new Error('Research identity differs: '+row.id);
     overlap++;
    }
    const result=research||row;count++;if(key==='nodes')counts[result.labels[0]]=(counts[result.labels[0]]||0)+1;yield result;
   }
   for(const row of retained.values())if(!seen.has(row.id)){count++;if(key==='nodes')counts[row.labels[0]]=(counts[row.labels[0]]||0)+1;yield row;}
  }
  files[file]=writeRecords(path.join(outputDir,file),records());sizes[key]=count;preserved[key]={overlap,retained:retained.size};
 }
 const result={...manifest,createdAt:new Date().toISOString(),...sizes,counts,files,researchBaselines:packets.map(p=>p.summary),preservedResearch:preserved,compiledSourceFiles:manifest.files,databaseWritten:false};
 fs.writeFileSync(path.join(outputDir,'manifest.json'),JSON.stringify(result,null,2)+'\n',{flag:'wx'});return result;
}
module.exports={extendResearchBaseline,preserveResearchSnapshot};
