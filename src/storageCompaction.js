const {canonicalJson}=require('./domain/serialization');
const {digest,LocalEvidenceArchive}=require('./evidenceArchive');
const {packRows,restoreRow}=require('./packedEvidence');
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const TABLES=['entities','relationships'];
function tableName(table){if(!TABLES.includes(table))throw new Error('Invalid graph table');return table;}
async function prepareStorage(client,directory,{onProgress=()=>{}}={}){
 if(fs.existsSync(path.join(directory,'archive-manifest.json')))throw new Error('Archive already prepared; choose a new directory');
 const archive=new LocalEvidenceArchive(directory),files={},counts={},originalCounts={};
 for(const table of TABLES){
  const file=path.join(directory,table+'.ndjson'),fd=fs.openSync(file,'wx'),hash=crypto.createHash('sha256');let cursor='',seen=0,changed=0;
  try{while(true){
   const rows=(await client.query(`SELECT t.*,md5(to_jsonb(t)::text) AS "beforeHash" FROM ${table} t WHERE id>$1 ORDER BY id LIMIT 1000`,[cursor])).rows;
   if(!rows.length)break;
   cursor=rows.at(-1).id;const before=new Map(rows.map(({beforeHash,...row})=>[row.id,{row,beforeHash}]));
   const packed=packRows([...before.values()].map(v=>v.row),{relationship:table==='relationships'});
   const pages=new Map();for(const page of packed.pages){archive.put(page.reference,page.data);for(const id of Object.keys(page.document.records))pages.set(id,page.document);}
   for(const next of packed.rows){
    const prior=before.get(next.id);if(canonicalJson(prior.row)===canonicalJson(next))continue;
    if(canonicalJson(restoreRow(next,pages.get(next.id),{relationship:table==='relationships'}))!==canonicalJson(prior.row))throw new Error('Lossless roundtrip failed: '+next.id);
    const line=Buffer.from(JSON.stringify({id:next.id,beforeHash:prior.beforeHash,next})+'\n');fs.writeSync(fd,line);hash.update(line);changed++;
   }
   seen+=rows.length;if(seen%10000===0)onProgress({table,seen,changed});
  }}finally{fs.closeSync(fd);}
  files[table+'.ndjson']=hash.digest('hex');counts[table]=changed;originalCounts[table]=seen;
 }
 const documents=[...archive.entries.values()],manifest={version:1,storageVersion:2,createdAt:new Date().toISOString(),snapshotFiles:files,counts,originalCounts,documents,compressedBytes:documents.reduce((n,d)=>n+d.compressedBytes,0)};
 fs.writeFileSync(path.join(directory,'archive-manifest.json'),JSON.stringify(manifest,null,2)+'\n');return manifest;
}
// Each batch is locked and checked against the backed-up original or the exact
// already-applied next row. Concurrent edits fail closed; retries are idempotent.
async function applyStorageBatch(client,table,changes){
 tableName(table);if(!changes.length)return 0;
 await client.query('BEGIN');
 try{
  await client.query('SELECT pg_advisory_xact_lock(73130908)');
  await client.query(`SELECT id FROM ${table} WHERE id=ANY($1::text[]) FOR UPDATE`,[changes.map(c=>c.id)]);
  const json=JSON.stringify(changes);
  const conflict=(await client.query(`SELECT s.id FROM jsonb_to_recordset($1::jsonb) AS s(id text,"beforeHash" text,next jsonb) LEFT JOIN ${table} t ON t.id=s.id WHERE t.id IS NULL OR (md5(to_jsonb(t)::text)<>s."beforeHash" AND to_jsonb(t) IS DISTINCT FROM s.next) LIMIT 1`,[json])).rows;
  if(conflict.length)throw new Error('Storage conflict: '+conflict[0].id);
  const columns=Object.keys(changes[0].next).filter(k=>k!=='id');
  if(columns.some(k=>!/^\w+$/.test(k)))throw new Error('Invalid storage column');
  const set=columns.map(k=>`"${k}"=n."${k}"`).join(',');
  const result=await client.query(`UPDATE ${table} t SET ${set} FROM jsonb_to_recordset($1::jsonb) AS s(id text,next jsonb) CROSS JOIN LATERAL jsonb_populate_record(NULL::${table},s.next) n WHERE t.id=s.id AND to_jsonb(t) IS DISTINCT FROM to_jsonb(n)`,[json]);
  const invalid=(await client.query(`SELECT s.id FROM jsonb_to_recordset($1::jsonb) AS s(id text,next jsonb) LEFT JOIN ${table} t ON t.id=s.id WHERE to_jsonb(t) IS DISTINCT FROM s.next LIMIT 1`,[json])).rows;
  if(invalid.length)throw new Error('Storage readback mismatch: '+invalid[0].id);
  await client.query('COMMIT');return result.rowCount;
 }catch(error){await client.query('ROLLBACK');throw error;}
}
module.exports={prepareStorage,applyStorageBatch};
