// Complete records live in immutable Azure pages. Existing graph rows remain a
// searchable directory: public IDs, endpoints and traversal roles never leave SQL.
const {canonicalJson}=require('./domain/serialization');
const {digest,MAX_BYTES}=require('./evidenceArchive');
const MARKER='storage:cold-graph:v1';
const hashes=new WeakMap();
function pageHash(document){
 if(!hashes.has(document)){require('./domain/catalog').deepFreeze(document);hashes.set(document,digest(canonicalJson(document)));}
 return hashes.get(document);
}
function eligible(row,relationship=false){
 if(row.threadId||row.lastChatThreadId||row.source==='chat'||row.extra?.coldRef)return false;
 if(!relationship)return (row.primaryLabel==='Url'&&row.source==='musicbrainz'&&row.id.startsWith('musicbrainz:url:')) ||
  (row.primaryLabel==='SimilarityAssessment'&&row.source==='musicmesh'&&row.id.startsWith('musicmesh:similarity:'));
 return (row.source==='musicmesh'&&['ComparesRecording','SupportedByAnalysis'].includes(row.type)) ||
  (row.source==='musicbrainz'&&row.type==='MusicBrainzRelationship' && (row.targetId.startsWith('musicbrainz:url:')||row.sourceId.startsWith('musicbrainz:url:')));
}
function packColdRows(rows,{relationship=false,pageSize=200}={}){
 if(!Number.isInteger(pageSize)||pageSize<1||pageSize>500)throw Error('Invalid cold page size');
 const output=[],pages=[];let pending=[],bytes=0;
 const retained=new Set(relationship?['id','sourceId','targetId','type']:['id','labels','primaryLabel','searchText','name']);
 function flush(){
  if(!pending.length)return;
  const document={version:3,kind:relationship?'relationship':'node',records:Object.fromEntries(pending.map(p=>[p.original.id,p.original]))};
  const data=Buffer.from(canonicalJson(document)),reference={version:1,sha256:digest(data),bytes:data.length};
  if(data.length>MAX_BYTES)throw Error('Cold page exceeds retrieval limit');
  const ref=Buffer.from(reference.sha256,'hex').toString('base64url');
  for(const item of pending)item.next.extra.coldRef=ref;
  pages.push({document,reference,data});pending=[];bytes=0;
 }
 for(const original of rows){
  if(!eligible(original,relationship)){output.push(original);continue;}
  const next=Object.fromEntries(Object.entries(original).map(([key,value])=>[key,retained.has(key)?value:null]));
  // Roles/attributes remain available to bounded SQL traversal without a fetch.
  next.extra=Object.fromEntries(['providerTypeId','providerTypeName','attributes'].filter(k=>Object.hasOwn(original.extra||{},k)).map(k=>[k,original.extra[k]]));
  const size=Buffer.byteLength(canonicalJson(original))+Buffer.byteLength(original.id)+16;
  if(pending.length>=pageSize||bytes+size>1024*1024)flush();
  pending.push({original,next});output.push(next);bytes+=size;
 }
 flush();return {rows:output,pages};
}
function restoreColdRow(row,document,{relationship=false}={}){
 const {referenceHash}=require('./packedEvidence');
 if(document?.version!==3||document.kind!==(relationship?'relationship':'node'))throw Error('Cold record kind mismatch');
 if(pageHash(document)!==referenceHash(row.extra?.coldRef))throw Error('Cold record checksum mismatch');
 const original=document.records?.[row.id];
 if(!original||original.id!==row.id)throw Error('Cold record identity missing');
 const keys=relationship?['sourceId','targetId','type']:['primaryLabel','labels','name','searchText'];
 for(const key of keys)if(Object.hasOwn(row,key)&&canonicalJson(row[key])!==canonicalJson(original[key]))throw Error('Cold directory conflict: '+key);
 for(const key of Object.keys(original))if(!['id','extra',...keys].includes(key)&&Object.hasOwn(row,key)&&row[key]!==null)throw Error('Cold directory conflict: '+key);
 for(const key of ['providerTypeId','providerTypeName','attributes'])if(Object.hasOwn(row.extra,key)&&canonicalJson(row.extra[key])!==canonicalJson(original.extra?.[key]))throw Error('Cold directory property conflict');
 if(Object.keys(row.extra).some(key=>!['coldRef','providerTypeId','providerTypeName','attributes'].includes(key)))throw Error('Cold directory property conflict');
 // A partial projection may have only id/extra; the owner is still checked by
 // the caller before archive access. Derived degree must survive restoration.
 return {...original,...(Object.hasOwn(row,'degree')?{degree:row.degree}:{})};
}
function createPageCache({maxBytes=32*1024*1024,ttlMs=300000,read=ref=>require('./packedEvidence').readPackedPage(ref),now=Date.now}={}){
 const values=new Map(),pending=new Map();let bytes=0;
 async function load(ref){
  require('./packedEvidence').referenceHash(ref);
  const prior=values.get(ref);
  if(prior&&prior.expires>now()){values.delete(ref);values.set(ref,prior);return prior.value;}
  if(prior){values.delete(ref);bytes-=prior.bytes;}
  const document=await read(ref);
  if(pageHash(document)!==require('./packedEvidence').referenceHash(ref))throw Error('Cached page checksum mismatch');
  const size=Buffer.byteLength(canonicalJson(document));
  require('./domain/catalog').deepFreeze(document);
  if(size<=maxBytes){
   while(bytes+size>maxBytes&&values.size){const key=values.keys().next().value;bytes-=values.get(key).bytes;values.delete(key);}
   // Concurrent reads can finish out of order; replace without double counting.
   if(values.has(ref)){bytes-=values.get(ref).bytes;values.delete(ref);}
   values.set(ref,{value:document,bytes:size,expires:now()+ttlMs});bytes+=size;
  }
  return document;
 }
 function get(ref){
  if(pending.has(ref))return pending.get(ref);
  const promise=load(ref).finally(()=>pending.delete(ref));pending.set(ref,promise);return promise;
 }
 return {get,stats:()=>({bytes,entries:values.size,maxBytes})};
}
const cache=createPageCache();
async function hydrateColdRow(row,{relationship=false,readPage=cache.get}={}){
 if(!row?.extra?.coldRef)return row;
 return restoreColdRow(row,await readPage(row.extra.coldRef),{relationship});
}
async function hydrateColdRows(rows,options={}){
 const output=new Array(rows.length);let cursor=0;
 await Promise.all(Array.from({length:Math.min(4,rows.length)},async()=>{while(cursor<rows.length){const index=cursor++;output[index]=await hydrateColdRow(rows[index],options);}}));
 return output;
}
module.exports={MARKER,eligible,packColdRows,restoreColdRow,createPageCache,hydrateColdRow,hydrateColdRows};
