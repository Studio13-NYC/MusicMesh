const fs=require('node:fs'),path=require('node:path'),readline=require('node:readline');
const {compactProperties,LocalEvidenceArchive,digest}=require('../evidenceArchive');
// Stream large snapshots: no second full in-memory graph or Neon reads.
async function prepareEvidenceArchive({directory,outputDir}){
 const manifest=JSON.parse(fs.readFileSync(path.join(directory,'manifest.json'))),archive=new LocalEvidenceArchive(outputDir);
 let originalBytes=0,compactBytes=0,records=0;
 for(const file of ['nodes.ndjson','relationships.ndjson']){
  const hash=require('node:crypto').createHash('sha256');
  const stream=fs.createReadStream(path.join(directory,file));stream.on('data',bytes=>hash.update(bytes));
  for await(const line of readline.createInterface({input:stream,crlfDelay:Infinity})){
   if(!line)continue;
   const row=JSON.parse(line),properties=compactProperties(row.properties,(ref,bytes)=>archive.put(ref,bytes));
   originalBytes+=Buffer.byteLength(line);compactBytes+=Buffer.byteLength(JSON.stringify({...row,properties}));records++;
  }
  if(hash.digest('hex')!==manifest.files[file])throw new Error('Snapshot checksum mismatch: '+file);
 }
 const documents=[...archive.entries.values()].sort((a,b)=>a.sha256.localeCompare(b.sha256));
 const result={version:1,snapshotFiles:manifest.files,records,originalBytes,compactBytes,documents,compressedBytes:documents.reduce((n,r)=>n+r.compressedBytes,0),databaseWritten:false};
 fs.writeFileSync(path.join(outputDir,'archive-manifest.json'),JSON.stringify(result,null,2)+'\n');
 const {documents:ignored,...summary}=result;
 return {...summary,documents:documents.length};
}
module.exports={prepareEvidenceArchive};
