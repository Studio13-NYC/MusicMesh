const fs=require('node:fs');
const path=require('node:path');
const {sha256}=require('./history');
const MBID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const USER_AGENT='MusicMesh/1.0 (https://musicmesh.s13.nyc/)';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function atomicJson(file,value) {
  const temp=`${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp,JSON.stringify(value)+'\n');
  // Windows readers/virus scanners may briefly deny replacement. Preserve the
  // last checkpoint throughout bounded retries; never unlink it as a workaround.
  for(let attempt=0;;attempt++){
    try{fs.renameSync(temp,file);return;}
    catch(error){if(!['EPERM','EBUSY','EACCES'].includes(error.code)||attempt>=19)throw error;Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50);}
  }
}
function recordingUrl(id) {
  if(typeof id!=='string'||!MBID.test(id))throw new Error('Invalid recording MBID');
  const url=new URL(`https://musicbrainz.org/ws/2/recording/${id.toLowerCase()}`);
  url.searchParams.set('fmt','json');
  // No release subquery: it is capped at 25 and cannot establish full release coverage.
  url.searchParams.set('inc','artist-credits+work-rels+artist-rels+recording-rels+url-rels+genres+tags+isrcs');
  return url.href;
}
function validateRecording(body) {
  if(!body || !MBID.test(body.id || '') || typeof body.title!=='string')throw new Error('Invalid MusicBrainz recording response');
}
class ProviderCache {
  constructor({dir,provider='musicbrainz',fetchImpl=fetch,sleep:wait=sleep,now=Date.now}={}) {
    if(!['musicbrainz','acousticbrainz'].includes(provider))throw new Error('Unsupported provider');
    this.provider=provider;
    this.dir=dir;this.fetchImpl=fetchImpl;this.wait=wait;this.now=now;this.nextRequestAt=0;
    this.queue=Promise.resolve();fs.mkdirSync(dir,{recursive:true});
  }
  get(url,validate) {
    // Serialize even concurrent callers so retry and ordinary requests share one rate limit.
    const pending=this.queue.then(()=>this.request(url,validate));
    this.queue=pending.catch(()=>{});return pending;
  }
  async request(url,validate) {
    const parsed=new URL(url);
    const origin=this.provider==='musicbrainz'?'https://musicbrainz.org':'https://acousticbrainz.org';
    const prefix=this.provider==='musicbrainz'?'/ws/2/':'/api/v1/';
    if(parsed.origin!==origin || !parsed.pathname.startsWith(prefix))throw new Error('Unsupported provider URL');
    const cachePath=path.join(this.dir,sha256(url)+'.json');
    if(fs.existsSync(cachePath)) {
      const cached=JSON.parse(fs.readFileSync(cachePath,'utf8'));
      if(cached.url!==url)throw new Error('Provider cache URL mismatch');
      if(cached.status==='ok') {
        if(sha256(JSON.stringify(cached.body))!==cached.bodyHash)throw new Error('Provider cache checksum mismatch');
        validate(cached.body);return {...cached,cachePath,cacheHit:true};
      }
      if(cached.status==='not-found' && this.provider==='musicbrainz')return {...cached,cachePath,cacheHit:true};
    }
    let result;
    for(let attempt=1;attempt<=3;attempt++) {
      const delay=Math.max(0,this.nextRequestAt-this.now());if(delay)await this.wait(delay);
      this.nextRequestAt=this.now()+1100;
      try {
        const response=await this.fetchImpl(url,{headers:{'User-Agent':USER_AGENT,Accept:'application/json'},signal:AbortSignal.timeout(30000)});
        if(response.headers.get('X-RateLimit-Remaining')==='0'){
          const resetIn=Number(response.headers.get('X-RateLimit-Reset-In'));
          if(Number.isFinite(resetIn) && resetIn>0)this.nextRequestAt=Math.max(this.nextRequestAt,this.now()+resetIn*1000);
        }
        const text=await response.text();
        const base={url,fetchedAt:new Date().toISOString(),httpStatus:response.status,attempts:attempt};
        if(response.ok) {
          const body=JSON.parse(text);validate(body);
          result={...base,status:'ok',body,bodyHash:sha256(JSON.stringify(body))};break;
        }
        if(response.status===404) {result={...base,status:'not-found'};break;}
        result={...base,status:'error',reason:`HTTP ${response.status}`};
        if(response.status!==429 && response.status<500)break;
        const header=response.headers.get('retry-after');
        const retrySeconds=header && /^\d+(?:\.\d+)?$/.test(header)?Number(header):null;
        const retryDate=header && retrySeconds===null?Date.parse(header):NaN;
        const retryDelay=retrySeconds!==null?retrySeconds*1000:Number.isFinite(retryDate)?Math.max(0,retryDate-this.now()):2000*2**(attempt-1);
        this.nextRequestAt=Math.max(this.nextRequestAt,this.now()+retryDelay);
      } catch(error) {
        result={url,fetchedAt:new Date().toISOString(),status:'error',reason:error.name==='TimeoutError'?'request-timeout':'network-or-invalid-response',attempts:attempt};
        this.nextRequestAt=Math.max(this.nextRequestAt,this.now()+2000*2**(attempt-1));
      }
    }
    atomicJson(cachePath,result);return {...result,cachePath,cacheHit:false};
  }
}

/** First enrichment pass: exact recording lookups, with a resumable disk cache. No DB writes. */
async function fetchRecordings({preparedDir,cacheDir,limit=Infinity,onProgress=()=>{}}) {
  if(limit!==Infinity && (!Number.isSafeInteger(limit)||limit<1))throw new Error('limit must be a positive integer');
  const manifest=JSON.parse(fs.readFileSync(path.join(preparedDir,'manifest.json'),'utf8'));
  const bytes=fs.readFileSync(path.join(preparedDir,'recording-mbids.json'));
  if(sha256(bytes)!==manifest.files['recording-mbids.json'])throw new Error('Prepared recording list checksum mismatch');
  const ids=JSON.parse(bytes);ids.forEach(recordingUrl);
  if(new Set(ids).size!==ids.length)throw new Error('Prepared recording IDs must be unique');
  fs.mkdirSync(cacheDir,{recursive:true});
  const lock=path.join(cacheDir,'fetch.lock');
  fs.writeFileSync(lock,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}),{flag:'wx'});
  const progress={phase:'recording-lookups',state:'running',total:ids.length,processed:0,ok:0,notFound:0,errors:0,cacheHits:0,databaseWritten:false};
  const client=new ProviderCache({dir:path.join(cacheDir,'responses')});
  let failures=0;
  try {
    for(const id of ids.slice(0,limit)) {
      const result=await client.get(recordingUrl(id),validateRecording);
      progress.processed++;progress.lastRecording=id;
      if(result.cacheHit)progress.cacheHits++;
      if(result.status==='ok') {progress.ok++;failures=0;}
      else if(result.status==='not-found') {progress.notFound++;failures=0;}
      else {progress.errors++;failures++;}
      progress.updatedAt=new Date().toISOString();
      atomicJson(path.join(cacheDir,'progress.json'),progress);onProgress({...progress});
      if(failures>=3 || (result.httpStatus>=400 && result.httpStatus<500 && ![404,429].includes(result.httpStatus)))throw new Error('Provider requests failing; cache preserved. Retry later.');
    }
    progress.state=progress.processed<ids.length?'limited':progress.errors?'incomplete':'complete';
    atomicJson(path.join(cacheDir,'progress.json'),progress);return progress;
  } catch(error) {
    progress.state='interrupted';atomicJson(path.join(cacheDir,'progress.json'),progress);throw error;
  } finally {fs.unlinkSync(lock);}
}
module.exports={ProviderCache,recordingUrl,validateRecording,fetchRecordings,atomicJson};
