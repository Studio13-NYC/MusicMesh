// Lossless storage representation, independent of the domain/source snapshot.
// Provider text is evidence data, never executable instructions.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {gzipSync,gunzipSync}=require('node:zlib');
const {canonicalJson}=require('./domain/serialization');
const FIELDS=['rawProvider','observations','providerEvidence'];
const MAX_BYTES=32*1024*1024;
const CONTAINER='musicmeshevidence';
const digest=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
function blobName(ref){
 if(ref?.version!==1||!/^[a-f0-9]{64}$/.test(ref.sha256)||!Number.isSafeInteger(ref.bytes)||ref.bytes<1)throw new Error('Invalid evidence reference');
 if(ref.bytes>MAX_BYTES)throw new Error('Evidence exceeds retrieval limit');
 return `v1/${ref.sha256.slice(0,2)}/${ref.sha256}.json.gz`;
}
function decodeEvidence(ref,compressed){
 blobName(ref);
 if(compressed.length>MAX_BYTES)throw new Error('Evidence exceeds retrieval limit');
 const bytes=gunzipSync(compressed,{maxOutputLength:MAX_BYTES});
 if(bytes.length!==ref.bytes||digest(bytes)!==ref.sha256)throw new Error('Evidence checksum/length mismatch');
 return JSON.parse(bytes.toString('utf8'));
}
function compactProperties(properties,put=()=>{}){
 const result={...properties},refs={...(properties.evidenceRefs||{})};
 // Preserve the values already used by answer projection, plus release country.
 for(const key of ['disambiguation','attributes','ended','video','country']){
  if(properties.rawProvider?.[key]!==undefined&&!Object.hasOwn(result,key))result[key]=properties.rawProvider[key];
 }
 for(const field of FIELDS){
  if(!Object.hasOwn(properties,field))continue;
  if(Object.hasOwn(refs,field))throw new Error('Evidence has both an inline value and a reference');
  const bytes=Buffer.from(canonicalJson(properties[field]));
  if(bytes.length<512)continue;
  const ref={version:1,sha256:digest(bytes),bytes:bytes.length};
  blobName(ref);put(ref,bytes);refs[field]=ref;delete result[field];
 }
 if(Object.keys(refs).length){result.evidenceRefs=refs;result.evidenceStorageVersion=1;}
 return result;
}
class LocalEvidenceArchive{
 constructor(directory){this.directory=path.resolve(directory);this.entries=new Map();fs.mkdirSync(this.directory,{recursive:true});}
 put(ref,bytes){
  const name=blobName(ref);if(digest(bytes)!==ref.sha256||bytes.length!==ref.bytes)throw new Error('Evidence checksum mismatch');
  if(this.entries.has(ref.sha256))return;
  const file=path.join(this.directory,name);fs.mkdirSync(path.dirname(file),{recursive:true});
  if(fs.existsSync(file))decodeEvidence(ref,fs.readFileSync(file));
  else fs.writeFileSync(file,gzipSync(bytes),{flag:'wx'});
  this.entries.set(ref.sha256,{...ref,compressedBytes:fs.statSync(file).size});
 }
 read(ref){return decodeEvidence(ref,fs.readFileSync(path.join(this.directory,blobName(ref))));}
}
function getEvidenceContainer(){
 const {BlobServiceClient}=require('@azure/storage-blob');
 const connection=process.env.MUSICMESH_EVIDENCE_CONNECTION_STRING||process.env.MUSICMESH_BLOB_CONNECTION_STRING;
 if(!connection)throw new Error('Azure evidence storage is not configured');
 // Reuse the app account, but never the chat container or a caller-supplied URL.
 return BlobServiceClient.fromConnectionString(connection).getContainerClient(CONTAINER);
}
async function readBlobEvidence(ref,container=getEvidenceContainer()){
 const client=container.getBlockBlobClient(blobName(ref));
 const properties=await client.getProperties();
 if(properties.contentLength>MAX_BYTES)throw new Error('Evidence exceeds retrieval limit');
 return decodeEvidence(ref,await client.downloadToBuffer(0,properties.contentLength,{conditions:{ifMatch:properties.etag}}));
}
async function uploadEvidenceArchive(directory,{onProgress=()=>{},container=getEvidenceContainer(),concurrency=8}={}){
 if(!Number.isInteger(concurrency)||concurrency<1||concurrency>32)throw new Error('Evidence upload concurrency must be an integer from 1 to 32');
 const manifestBytes=fs.readFileSync(path.join(directory,'archive-manifest.json'));
 const manifest=JSON.parse(manifestBytes);
 if(manifest.version!==1)throw new Error('Unsupported evidence archive');
 await container.createIfNotExists();
 if((await container.getProperties()).blobPublicAccess)throw new Error('Evidence container must be private');
 let created=0,verified=0,bytes=0;
 // Bounded parallel uploads, with transport checksums and conditional creation.
 let next=0,failure;
 await Promise.all(Array.from({length:concurrency},async()=>{
  try{while(!failure&&next<manifest.documents.length){
   const ref=manifest.documents[next++],name=blobName(ref),data=fs.readFileSync(path.join(directory,name));
   decodeEvidence(ref,data);
   const md5=crypto.createHash('md5').update(data).digest();
   const client=container.getBlockBlobClient(name);
   try{
    await client.uploadData(data,{conditions:{ifNoneMatch:'*'},blobHTTPHeaders:{blobContentType:'application/gzip',blobContentMD5:md5},metadata:{sha256:ref.sha256,uncompressedbytes:String(ref.bytes)}});created++;bytes+=data.length;
   }catch(error){
    if(![409,412].includes(error.statusCode))throw error;
    // Never trust an existing object based on its name or metadata alone.
    await readBlobEvidence(ref,container);
   }
   verified++;if(verified%1000===0)onProgress({created,verified,total:manifest.documents.length,bytes});
  }}catch(error){failure=failure||error;}
 }));
 if(failure)throw failure;
 const receipt={version:1,manifestHash:digest(manifestBytes),container:CONTAINER,account:container.accountName,created,verified,uploadedBytes:bytes,verifiedAt:new Date().toISOString()};
 fs.writeFileSync(path.join(directory,'archive-upload-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 return receipt;
}
function verifiedArchive(directory,snapshotFiles){
 const bytes=fs.readFileSync(path.join(directory,'archive-manifest.json')),manifest=JSON.parse(bytes);
 const receipt=JSON.parse(fs.readFileSync(path.join(directory,'archive-upload-receipt.json')));
 if(manifest.version!==1||receipt.manifestHash!==digest(bytes)||receipt.verified!==manifest.documents.length||receipt.container!==CONTAINER||canonicalJson(manifest.snapshotFiles)!==canonicalJson(snapshotFiles))throw new Error('Evidence upload receipt does not match snapshot');
 return {manifest,receipt,hashes:new Set(manifest.documents.map(ref=>ref.sha256))};
}
module.exports={FIELDS,CONTAINER,MAX_BYTES,digest,blobName,decodeEvidence,compactProperties,LocalEvidenceArchive,getEvidenceContainer,readBlobEvidence,uploadEvidenceArchive,verifiedArchive};
