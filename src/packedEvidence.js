// Storage only: graph identities and domain semantics never change. A page is
// immutable, checksum addressed and private. Authorization belongs to its row.
const {canonicalJson}=require('./domain/serialization');
const {digest,MAX_BYTES,getEvidenceContainer,decodeEvidence}=require('./evidenceArchive');
const FIELDS=['rawProvider','providerEvidence','observations','evidenceRefs','evidenceStorageVersion','explanation','assertionKey','definitionUrl','sourceType','targetType'];
const PROTECTED_NODES=new Set(['EvidenceAssertion','SourceDocument','PreferenceSignal','ListeningEvent','IdentityMapping']);
const PROTECTED_EDGES=new Set(['AssertionSubject','AssertionFactor','SupportedBySource','PreferenceFor']);
const MARKER='storage:packed-evidence:v2';
const pageHashes=new WeakMap();
function pageHash(document){
 if(!pageHashes.has(document)){
  require('./domain/catalog').deepFreeze(document);
  pageHashes.set(document,digest(canonicalJson(document)));
 }
 return pageHashes.get(document);
}
function referenceHash(value){
 if(typeof value!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value))throw new Error('Invalid packed evidence reference');
 const bytes=Buffer.from(value,'base64url');
 if(bytes.length!==32||bytes.toString('base64url')!==value)throw new Error('Invalid packed evidence reference');
 return bytes.toString('hex');
}
function inferredIdentity(row){
 const match=/^musicbrainz:([a-z-]+):([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/.exec(row.id);
 return match?{provider:'musicbrainz',type:match[1],value:match[2]}:null;
}
function projectIdentity(row){
 const extra={...(row.extra||{})};
 if(extra.detailsRef){
  referenceHash(extra.detailsRef);
  if(!extra.externalId&&inferredIdentity(row))extra.externalId=inferredIdentity(row);
  if(!extra.definitionUrl&&extra.providerTypeId)extra.definitionUrl='https://musicbrainz.org/relationship/'+extra.providerTypeId;
 }
 return extra;
}
function packRows(rows,{relationship=false,pageSize=200}={}){
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>500)throw new Error('Invalid page size');
 if(new Set(rows.map(r=>r.id)).size!==rows.length)throw new Error('Duplicate packed identities');
 const output=[],pages=[];let pending=[],bytes=0;
 function flush(){
  if(!pending.length)return;
  const document={version:2,kind:relationship?'relationship':'node',records:Object.fromEntries(pending.map(p=>[p.row.id,p.details]))};
  const data=Buffer.from(canonicalJson(document)),reference={version:1,sha256:digest(data),bytes:data.length};
  if(data.length>MAX_BYTES)throw new Error('Packed page exceeds retrieval limit');
  const ref=Buffer.from(reference.sha256,'hex').toString('base64url');
  for(const p of pending)p.row.extra.detailsRef=ref;
  pages.push({document,reference,data});pending=[];bytes=0;
 }
 for(const original of rows){
  if((relationship?PROTECTED_EDGES.has(original.type):PROTECTED_NODES.has(original.primaryLabel))||original.extra?.detailsRef){output.push(original);continue;}
  const row={...original,extra:{...original.extra}},details={extra:{}};
  for(const key of FIELDS)if(Object.hasOwn(row.extra,key)){
   if(key==='definitionUrl'&&row.extra[key]!=='https://musicbrainz.org/relationship/'+row.extra.providerTypeId)continue;
   details.extra[key]=row.extra[key];delete row.extra[key];
  }
  if(!relationship){
   if(row.domainId===row.id){details.domainId=row.domainId;row.domainId=null;}
   if(row.extra.externalId&&canonicalJson(row.extra.externalId)===canonicalJson(inferredIdentity(row))){details.extra.externalId=row.extra.externalId;delete row.extra.externalId;}
  }
  // A small structural assertion does not justify another pointer/read.
  if(Buffer.byteLength(canonicalJson(original))-Buffer.byteLength(canonicalJson(row))<128){output.push(original);continue;}
  const size=Buffer.byteLength(canonicalJson(details))+Buffer.byteLength(row.id)+16;
  if(pending.length>=pageSize||bytes+size>1024*1024)flush();
  output.push(row);pending.push({row,details});bytes+=size;
 }
 flush();return {rows:output,pages};
}
function restoreRow(row,document,{relationship=false}={}){
 if(document?.version!==2||document.kind!==(relationship?'relationship':'node'))throw new Error('Packed evidence kind mismatch');
 if(!Object.hasOwn(document.records||{},row.id))throw new Error('Packed evidence identity not found');
 if(pageHash(document)!==referenceHash(row.extra?.detailsRef))throw new Error('Packed evidence checksum mismatch');
 const details=document.records[row.id],extra={...row.extra};delete extra.detailsRef;
 if(!details.extra||typeof details.extra!=='object'||Array.isArray(details.extra))throw new Error('Invalid packed properties');
 for(const key of Object.keys(details.extra))if(Object.hasOwn(extra,key))throw new Error('Packed property conflicts with inline value');
 return {...row,...(Object.hasOwn(details,'domainId')?{domainId:details.domainId}:{}),extra:{...details.extra,...extra}};
}
async function readPackedPage(value,container=getEvidenceContainer()){
 const sha256=referenceHash(value),blob=container.getBlockBlobClient(`v1/${sha256.slice(0,2)}/${sha256}.json.gz`);
 const info=await blob.getProperties();
 if(info.contentLength>MAX_BYTES)throw new Error('Packed page exceeds retrieval limit');
 const ref={version:1,sha256,bytes:Number(info.metadata?.uncompressedbytes)};
 return decodeEvidence(ref,await blob.downloadToBuffer(0,info.contentLength,{conditions:{ifMatch:info.etag}}));
}
async function expandRow(row,{relationship=false,readPage=readPackedPage}={}){
 return row.extra?.detailsRef?restoreRow(row,await readPage(row.extra.detailsRef),{relationship}):row;
}
async function uploadPackedPages(pages,container){
 if(!pages.length)return;
 container=container||getEvidenceContainer();
 if((await container.getProperties()).blobPublicAccess)throw new Error('Private evidence container required');
 for(const page of pages){
  const {gzipSync}=require('node:zlib'),{createHash}=require('node:crypto');
  const data=gzipSync(page.data),ref=page.reference,blob=container.getBlockBlobClient(`v1/${ref.sha256.slice(0,2)}/${ref.sha256}.json.gz`);
  decodeEvidence(ref,data);
  try{await blob.uploadData(data,{conditions:{ifNoneMatch:'*'},metadata:{sha256:ref.sha256,uncompressedbytes:String(ref.bytes)},blobHTTPHeaders:{blobContentType:'application/gzip',blobContentMD5:createHash('md5').update(data).digest()}});}
  catch(error){if(![409,412].includes(error.statusCode))throw error;await readPackedPage(Buffer.from(ref.sha256,'hex').toString('base64url'),container);}
 }
}
module.exports={FIELDS,MARKER,referenceHash,projectIdentity,packRows,restoreRow,readPackedPage,expandRow,uploadPackedPages};
