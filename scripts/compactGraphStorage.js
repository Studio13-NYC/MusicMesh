// Lossless graph-storage maintenance. No automatic database reset or pruning.
const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline'),crypto=require('node:crypto');
const {parseArgs}=require('node:util'),{Client}=require('pg');
const {prepareStorage,applyStorageBatch}=require('../src/storageCompaction');
const {assertMainDevelopmentTarget}=require('../src/import/graphSnapshot');
const {verifiedArchive,getEvidenceContainer}=require('../src/evidenceArchive');
const {MARKER}=require('../src/packedEvidence');
async function hashFile(file){const h=crypto.createHash('sha256');for await(const b of fs.createReadStream(file))h.update(b);return h.digest('hex');}
async function counts(c){return (await c.query(`SELECT pg_database_size(current_database())::text AS bytes,(SELECT count(*)::int FROM entities) AS entities,(SELECT count(*)::int FROM relationships) AS relationships,(SELECT count(*)::int FROM entities WHERE "primaryLabel"='ListeningEvent') AS plays`)).rows[0];}
async function main(){
 const {positionals,values}=parseArgs({allowPositionals:true,options:{archive:{type:'string'},backup:{type:'string'},cold:{type:'boolean'}}});
 const command=positionals[0],mainTarget=command?.endsWith('-main');
 if(!['prepare','apply-local','apply-main','reclaim-local','reclaim-main'].includes(command)||!values.archive)throw Error('Usage: compactGraphStorage.js prepare|apply-local|apply-main|reclaim-local|reclaim-main --archive <directory> [--backup <verified backup directory>]');
 const url=new URL(mainTarget?process.env.DIRECT_URL:process.env.DATABASE_URL);
 if(mainTarget){assertMainDevelopmentTarget(url.toString());if(url.hostname.includes('-pooler.'))throw Error('Direct connection required');}
 else if(url.hostname!=='127.0.0.1'||url.port!=='55433'||url.pathname!=='/musicmesh_storage_20261019')throw Error('Use the dedicated local storage rehearsal database');
 const directory=path.resolve(values.archive),c=new Client({connectionString:url.toString(),connectionTimeoutMillis:15000,statement_timeout:300000,lock_timeout:10000});await c.connect();
 try{
  if(command==='prepare'){const m=await prepareStorage(c,directory,{cold:!!values.cold,onProgress:p=>console.log(JSON.stringify(p))});console.log(JSON.stringify({...m,documents:m.documents.length}));return;}
  const manifest=JSON.parse(fs.readFileSync(path.join(directory,'archive-manifest.json')));
  if(![2,3].includes(manifest.storageVersion))throw Error('Packed archive required');
  for(const [file,hash] of Object.entries(manifest.snapshotFiles))if(await hashFile(path.join(directory,file))!==hash)throw Error('Migration file checksum mismatch');
  if(mainTarget){
   if(!values.backup)throw Error('Verified full backup required');
   const backup=JSON.parse(fs.readFileSync(path.join(values.backup,'azure-backup-receipt.json'))),restore=JSON.parse(fs.readFileSync(path.join(values.backup,'restore-verification.json')));
   if(!backup.azureVerifiedAt||restore.state!=='verified'||JSON.stringify(backup.fingerprints)!==JSON.stringify(restore.fingerprints))throw Error('Backup restoration verification missing');
   const evidence=verifiedArchive(directory,manifest.snapshotFiles),container=getEvidenceContainer();
   if(evidence.receipt.account!==container.accountName||(await container.getProperties()).blobPublicAccess)throw Error('Verified private archive required');
  }
  const receipt={state:'running',startedAt:new Date().toISOString(),target:mainTarget?'MusicMesh main':'local storage rehearsal',before:await counts(c),manifestHash:await hashFile(path.join(directory,'archive-manifest.json')),updated:{entities:0,relationships:0},verified:{entities:0,relationships:0}};
  const receiptFile=path.join(directory,command+'-receipt.json');
  try{
   if(command.startsWith('apply')){
    await c.query('INSERT INTO import_batches ("sourceHash",nodes,relationships) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',[manifest.storageVersion===3?require('../src/coldGraph').MARKER:MARKER,manifest.originalCounts.entities,manifest.originalCounts.relationships]);
    for(const table of ['entities','relationships']){
     let batch=[];
     async function flush(){if(!batch.length)return;receipt.updated[table]+=await applyStorageBatch(c,table,batch);receipt.verified[table]+=batch.length;batch=[];if(receipt.verified[table]%10000===0){fs.writeFileSync(receiptFile,JSON.stringify(receipt,null,2));console.log(JSON.stringify({table,verified:receipt.verified[table],updated:receipt.updated[table]}));}}
     for await(const line of readline.createInterface({input:fs.createReadStream(path.join(directory,table+'.ndjson')),crlfDelay:Infinity})){if(line)batch.push(JSON.parse(line));if(batch.length>=500)await flush();}await flush();
     if(receipt.verified[table]!==manifest.counts[table])throw Error('Migration record count mismatch');
    }
   }else{
    const applied=JSON.parse(fs.readFileSync(path.join(directory,(mainTarget?'apply-main':'apply-local')+'-receipt.json')));
    if(applied.state!=='verified'||applied.manifestHash!==receipt.manifestHash)throw Error('Verified application required before reclaiming space');
    if(!(await c.query('SELECT pg_try_advisory_lock(73130908) AS acquired')).rows[0].acquired)throw Error('Graph writer active');
    for(const table of ['entities','relationships']){console.log(JSON.stringify({stage:'reclaim',table}));await c.query(`VACUUM (FULL,ANALYZE) ${table}`);}
   }
   receipt.after=await counts(c);for(const key of ['entities','relationships','plays'])if(receipt.after[key]!==receipt.before[key])throw Error('Graph counts changed during storage operation');
   receipt.state='verified';receipt.completedAt=new Date().toISOString();
  }catch(error){receipt.state='incomplete';receipt.error=error.message;throw error;}
  finally{fs.writeFileSync(receiptFile,JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));}
 }finally{await c.end();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1});
