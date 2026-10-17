const fs=require('node:fs'),path=require('node:path');
const {AcousticAnalysis}=require('../domain');
const {canonicalJson}=require('../domain/serialization');
const {sha256}=require('./history');
const {ProviderCache,atomicJson}=require('./providerCache');
const {countUrl,validateCounts}=require('./acousticCoverage');
function lowLevelUrl(ids,offset=0){
  countUrl(ids);
  if(!Number.isSafeInteger(offset)||offset<0)throw new Error('Invalid submission offset');
  const url=new URL('https://acousticbrainz.org/api/v1/low-level');
  url.searchParams.set('recording_ids',ids.map(id=>id+':'+offset).join(';'));return url.href;
}
function validateBulk(body,ids,offset=0){
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Invalid acoustic response');
  for(const [id,submissions] of Object.entries(body)){
    if(id==='mbid_mapping'){
      if(!submissions||typeof submissions!=='object'||Array.isArray(submissions)||Object.entries(submissions).some(([a,b])=>a!==b||!ids.includes(a)))throw new Error('Unexpected acoustic identity mapping');
      continue;
    }
    if(!ids.includes(id))throw new Error('Unexpected acoustic identity');
    if(!submissions||typeof submissions!=='object'||Array.isArray(submissions))throw new Error('Invalid submissions');
    for(const [key,document] of Object.entries(submissions)){
      if(key!==String(offset))throw new Error('Unexpected submission offset');
      if(!document?.metadata||typeof document.metadata!=='object')throw new Error('Invalid acoustic document');
    }
  }
}
function analysisFromDocument(mbid,offset,document,evidence,availableSubmissions){
  lowLevelUrl([mbid],offset);
  const version=document.metadata?.version;
  if(!version||typeof version.extractor!=='string'||!version.extractor||typeof version.essentia!=='string'||!version.essentia)throw new Error('Missing extractor version');
  const features={rhythm:{},timbre:{},tonal:{}};
  function scalar(target,key,value,unit){if(value===undefined||value===null)return;if(typeof value!=='number'||!Number.isFinite(value))throw new Error('Acoustic measurement must be finite');target[key]={value,unit};}
  scalar(features.rhythm,'bpm',document.rhythm?.bpm,'beats/minute');
  scalar(features.rhythm,'onsetRate',document.rhythm?.onset_rate,'onsets/second');
  scalar(features.rhythm,'danceability',document.rhythm?.danceability,'Essentia danceability index');
  const mfcc=document.lowlevel?.mfcc?.mean;
  if(mfcc!==undefined){if(!Array.isArray(mfcc)||mfcc.length!==13||mfcc.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw new Error('MFCC mean requires 13 finite coefficients');features.timbre.mfccMean={value:mfcc,unit:'Essentia MFCC coefficients'};}
  for(const [key,source] of [['key','key_key'],['scale','key_scale']])if(typeof document.tonal?.[source]==='string')features.tonal[key]=document.tonal[source];
  scalar(features.tonal,'keyStrength',document.tonal?.key_strength,'Essentia key correlation');
  const audio=document.metadata?.audio_properties||{};
  const audioProperties=Object.fromEntries(['analysis_sample_rate','sample_rate','length','codec','lossless','downmix','equal_loudness','replay_gain'].filter(key=>Object.hasOwn(audio,key)).map(key=>[key,audio[key]]));
  const contentHash=sha256(canonicalJson(document));
  return new AcousticAnalysis({id:`acousticbrainz:analysis:${mbid}:${offset}:${contentHash}`,name:`Acoustic analysis ${mbid} / submission ${offset}`,properties:{
    recordingId:'musicbrainz:recording:'+mbid,submissionId:String(offset),extractorVersion:canonicalJson(version),features,audioProperties,
    source:'acousticbrainz',evidenceBasis:'audio-analysis',providerEvidence:evidence,contentHash,availableSubmissions,
    selectionPolicy:offset===0?'first-submission-v1':'explicit-submission-v1',selectionLimitation:'This submission is not a verified match to the audio actually scrobbled. Other submissions are not averaged or silently substituted.'
  }});
}
function readCoverage(preparedDir,coverageDir){
  const manifest=JSON.parse(fs.readFileSync(path.join(preparedDir,'manifest.json')));
  const bytes=fs.readFileSync(path.join(preparedDir,'recording-mbids.json'));
  if(sha256(bytes)!==manifest.files['recording-mbids.json'])throw new Error('Prepared recording checksum mismatch');
  const ids=JSON.parse(bytes),coverage=JSON.parse(fs.readFileSync(path.join(coverageDir,'coverage.json')));
  if(coverage.state!=='complete'||coverage.recordingListHash!==manifest.files['recording-mbids.json']||coverage.records.length!==ids.length)throw new Error('Feature collection requires complete matching coverage');
  const records=new Map(coverage.records.map(r=>[r.id,r])),responses=new Map();
  if(records.size!==ids.length)throw new Error('Duplicate coverage identities');
  for(const id of ids){
    const record=records.get(id);if(!record)throw new Error('Coverage identity missing');
    const url=record.evidence?.url;
    if(!responses.has(url)){
      const parsed=new URL(url),batch=parsed.searchParams.get('recording_ids')?.split(';');
      if(url!==countUrl(batch))throw new Error('Unexpected coverage URL');
      const cached=JSON.parse(fs.readFileSync(path.join(coverageDir,'responses',sha256(url)+'.json')));
      if(cached.status!=='ok'||cached.url!==url||sha256(JSON.stringify(cached.body))!==cached.bodyHash)throw new Error('Coverage response checksum mismatch');
      validateCounts(cached.body,batch);responses.set(url,cached);
    }
    const response=responses.get(url),count=response.body[id]?.count||0;
    if(!new URL(url).searchParams.get('recording_ids').split(';').includes(id))throw new Error('Coverage identity absent from count request');
    if(record.evidence.responseHash!==response.bodyHash||record.count!==count||record.status!==(count?'available':'missing'))throw new Error('Coverage differs from verified count response');
  }
  return {manifest,records:ids.map(id=>records.get(id))};
}
/** First submitted audio per available recording; full responses stay in the resumable local cache. */
async function fetchAcousticFeatures({preparedDir,coverageDir,cacheDir,limit=Infinity,client:providedClient,onProgress=()=>{}}){
  if(limit!==Infinity&&(!Number.isSafeInteger(limit)||limit<1))throw new Error('limit must be a positive integer');
  const {manifest,records}=readCoverage(preparedDir,coverageDir),available=records.filter(r=>r.status==='available');
  fs.mkdirSync(cacheDir,{recursive:true});const lock=path.join(cacheDir,'fetch.lock');
  fs.writeFileSync(lock,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}),{flag:'wx'});
  const client=providedClient||new ProviderCache({dir:path.join(cacheDir,'responses'),provider:'acousticbrainz'});
  const selected=available.slice(0,limit),analyses=[],results=[];
  const progress={phase:'acoustic-features',state:'running',selectionPolicy:'first-submission-v1',total:available.length,processed:0,collected:0,missing:0,unsupported:0,errors:0,databaseWritten:false};
  const save=()=>{progress.updatedAt=new Date().toISOString();atomicJson(path.join(cacheDir,'progress.json'),progress);onProgress({...progress});};
  let failures=0;
  try{
    for(let i=0;i<selected.length;i+=25){
      const batch=selected.slice(i,i+25),ids=batch.map(r=>r.id),response=await client.get(lowLevelUrl(ids),body=>validateBulk(body,ids));
      for(const record of batch){
        const document=response.body?.[record.id]?.['0'];let status=response.status!=='ok'?'error':document?'collected':'missing',reason;
        if(status==='collected')try{analyses.push(analysisFromDocument(record.id,0,document,{url:response.url,responseHash:response.bodyHash,retrievedAt:response.fetchedAt},record.count));}
        catch(error){status='unsupported';reason=error.message;}
        progress[status==='error'?'errors':status]++;progress.processed++;results.push({id:record.id,status,...(reason?{reason}:{})});
      }
      save();failures=response.status==='ok'?0:failures+1;
      if(failures>=3||(response.httpStatus>=400&&response.httpStatus<500&&response.httpStatus!==429))throw new Error('Acoustic feature requests interrupted; resume uses the verified cache');
    }
    progress.state=progress.processed<progress.total?'limited':progress.errors?'incomplete':'complete';
    const bytes=analyses.map(a=>JSON.stringify(a.toGraphNode())).join('\n')+(analyses.length?'\n':'');
    const file=path.join(cacheDir,'analyses.ndjson');fs.writeFileSync(file+'.tmp',bytes);fs.renameSync(file+'.tmp',file);
    atomicJson(path.join(cacheDir,'manifest.json'),{version:1,...progress,input:manifest.input,recordingListHash:manifest.files['recording-mbids.json'],files:{'analyses.ndjson':sha256(bytes)},results});
    save();return progress;
  }catch(error){progress.state='interrupted';save();throw error;}
  finally{fs.unlinkSync(lock);}
}
module.exports={lowLevelUrl,validateBulk,analysisFromDocument,readCoverage,fetchAcousticFeatures};
