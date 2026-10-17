const fs=require('node:fs');
const path=require('node:path');
const {sha256}=require('./history');
const {ProviderCache,atomicJson}=require('./providerCache');
const MBID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function countUrl(ids){
  if(!Array.isArray(ids)||!ids.length||ids.length>25)throw new Error('Count request requires 1 to 25 IDs');
  if(ids.some(id=>!MBID.test(id)))throw new Error('Invalid recording MBID');
  const url=new URL('https://acousticbrainz.org/api/v1/count');url.searchParams.set('recording_ids',ids.join(';'));return url.href;
}
function validateCounts(body,ids){
  if(!body||typeof body!=='object'||Array.isArray(body))throw new Error('Invalid count response');
  for(const [id,value] of Object.entries(body)){
    // Requests already use normalized MBIDs. Normalization is not a recording merge/redirect.
    if(id==='mbid_mapping'){
      if(!value||typeof value!=='object'||Array.isArray(value)||Object.entries(value).some(([source,target])=>source!==target||!ids.includes(source)))throw new Error('Unexpected MBID normalization response');
      continue;
    }
    if(!MBID.test(id))throw new Error('Invalid count response');
    if(!ids.includes(id))throw new Error('Unexpected recording in count response');
    if(!value||!Number.isSafeInteger(value.count)||value.count<0)throw new Error('Invalid submission count');
  }
}
function summarizeCoverage(records,weights,totalPlays){
  const summary={totalRecordings:weights.size,totalPlays,mappedPlays:[...weights.values()].reduce((a,b)=>a+b,0),availableRecordings:0,missingRecordings:0,unknownRecordings:weights.size-records.length,availablePlays:0,totalSubmissions:0};
  for(const record of records){
    if(record.status==='available'){summary.availableRecordings++;summary.availablePlays+=weights.get(record.id)||0;summary.totalSubmissions+=record.count;}
    else if(record.status==='missing')summary.missingRecordings++;
    else summary.unknownRecordings++;
  }
  summary.unresolvedPlays=totalPlays-summary.mappedPlays;
  summary.distinctCoverage=summary.totalRecordings?summary.availableRecordings/summary.totalRecordings:0;
  summary.allPlayCoverage=totalPlays?summary.availablePlays/totalPlays:0;
  return summary;
}
/** Coverage of exact provider-mapped recording IDs; no acoustic analyses or database writes. */
async function fetchAcousticCoverage({preparedDir,cacheDir,limit=Infinity,onProgress=()=>{},client:providedClient}){
  if(limit!==Infinity&&(!Number.isSafeInteger(limit)||limit<1))throw new Error('limit must be a positive integer');
  const manifest=JSON.parse(fs.readFileSync(path.join(preparedDir,'manifest.json')));
  function read(name){const bytes=fs.readFileSync(path.join(preparedDir,name));if(sha256(bytes)!==manifest.files[name])throw new Error('Prepared input checksum mismatch');return bytes.toString('utf8');}
  const ids=JSON.parse(read('recording-mbids.json'));ids.forEach(id=>countUrl([id]));
  const mappings=read('mappings.ndjson').trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const weights=new Map(ids.map(id=>[id,0]));
  if(weights.size!==ids.length)throw new Error('Duplicate prepared recording IDs');
  for(const mapping of mappings){const target=mapping.properties.targetId;if(!target)continue;const id=target.slice('musicbrainz:recording:'.length);if(!target.startsWith('musicbrainz:recording:')||!weights.has(id))throw new Error('Mapping target not in prepared recording list');weights.set(id,weights.get(id)+1);}
  if([...weights.values()].some(n=>!n))throw new Error('Recording list contains an unreferenced identity');
  fs.mkdirSync(cacheDir,{recursive:true});const lock=path.join(cacheDir,'fetch.lock');
  fs.writeFileSync(lock,JSON.stringify({pid:process.pid,startedAt:new Date().toISOString()}),{flag:'wx'});
  const records=[],selected=ids.slice(0,limit),client=providedClient||new ProviderCache({dir:path.join(cacheDir,'responses'),provider:'acousticbrainz'});
  const progress={phase:'acoustic-coverage',state:'running',processed:0,total:ids.length,databaseWritten:false,analysesDownloaded:0};
  const save=()=>{Object.assign(progress,summarizeCoverage(records,weights,mappings.length),{updatedAt:new Date().toISOString()});atomicJson(path.join(cacheDir,'coverage.json'),{...progress,input:manifest.input,recordingListHash:manifest.files['recording-mbids.json'],records});atomicJson(path.join(cacheDir,'progress.json'),progress);onProgress({...progress});};
  let failures=0;
  try {
    for(let i=0;i<selected.length;i+=25){
      const batch=selected.slice(i,i+25),result=await client.get(countUrl(batch),body=>validateCounts(body,batch));
      for(const id of batch){const count=result.status==='ok'?(result.body[id]?.count||0):null;records.push({id,status:count===null?'error':count>0?'available':'missing',count,evidence:{url:result.url,responseHash:result.bodyHash||null,retrievedAt:result.fetchedAt,httpStatus:result.httpStatus||null}});}
      progress.processed+=batch.length;save();failures=result.status==='ok'?0:failures+1;
      if(failures>=3||(result.httpStatus>=400&&result.httpStatus<500&&result.httpStatus!==429))throw new Error('AcousticBrainz coverage interrupted; failed batches remain unknown and can be retried');
    }
    progress.state=progress.processed<ids.length?'limited':records.some(r=>r.status==='error')?'incomplete':'complete';save();return progress;
  }catch(error){progress.state='interrupted';save();throw error;}
  finally{fs.unlinkSync(lock);}
}
module.exports={countUrl,validateCounts,summarizeCoverage,fetchAcousticCoverage};
