// Full-size rehearsal on a dedicated, empty LOCAL database only. Never Neon.
const fs=require('node:fs'),path=require('node:path');
const {parseArgs}=require('node:util');
const {readSnapshot}=require('../src/import/graphSnapshot');
const {persistDomainBatch}=require('../src/domain/repository');
const {getDatabase,closeDatabase}=require('../src/postgres');
async function main(){
 const {values}=parseArgs({options:{snapshot:{type:'string'},output:{type:'string'}}});
 if(!values.snapshot||!values.output)throw new Error('Requires --snapshot <directory> --output <receipt file>');
 const url=new URL(process.env.DATABASE_URL);
 if(url.hostname!=='127.0.0.1'||url.port!=='55433'||url.pathname!=='/musicmesh_restore')throw new Error('Measurement requires local MusicMesh restore database at 127.0.0.1:55433');
 const db=getDatabase();
 if(await db.entity.count()||await db.relationship.count())throw new Error('Measurement database must be empty; no automatic reset');
 const graph=readSnapshot(values.snapshot),startedAt=new Date().toISOString();
 for(const [key,objects] of [['nodes',graph.nodes],['relationships',graph.relationships]]){
  for(let i=0;i<objects.length;i+=200){
   await persistDomainBatch(db,{[key]:objects.slice(i,i+200),compactEvidence:true});
   if(i%10000===0)console.log(JSON.stringify({stage:key,verified:Math.min(i+200,objects.length),total:objects.length}));
  }
 }
 const counts={nodes:await db.entity.count(),relationships:await db.relationship.count()};
 if(counts.nodes!==graph.manifest.nodes||counts.relationships!==graph.manifest.relationships)throw new Error('Measurement count mismatch');
 const sizes=await db.$queryRaw`SELECT pg_database_size(current_database())::text AS database_bytes, pg_total_relation_size('entities')::text AS entities_bytes, pg_total_relation_size('relationships')::text AS relationships_bytes`;
 const receipt={startedAt,completedAt:new Date().toISOString(),target:'local:127.0.0.1:55433/musicmesh_restore',snapshotFiles:graph.manifest.files,storageVersion:1,...counts,sizes:sizes[0],cloudDatabaseWritten:false,limitation:'Fresh local allocation, not a forecast of in-place Neon allocation or final enriched catalog size. Blob access is verified separately.'};
 fs.mkdirSync(path.dirname(values.output),{recursive:true});fs.writeFileSync(values.output,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
}
main().catch(e=>{console.error(e.message);process.exitCode=1;}).finally(closeDatabase);
