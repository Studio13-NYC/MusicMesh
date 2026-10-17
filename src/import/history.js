const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { parse } = require('csv-parse/sync');
const { ListeningEvent, IdentityMapping } = require('../domain');

const VERSION = 1;
const MBID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const sha256 = data => createHash('sha256').update(data).digest('hex');
const eventKey = (timestamp, artist, title, album = '') => JSON.stringify([timestamp, artist, title, album]);
function requireText(value, field) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`);
}

/** Raw Last.fm IDs remain evidence, never a claim about a MusicBrainz entity type. */
function parseHistoryCsv(input, account) {
  requireText(account, 'account');
  const sourceHash = sha256(input);
  const records = parse(input, { bom:true, skip_empty_lines:true, columns(headers) {
    if (new Set(headers).size !== headers.length) throw new Error('Duplicate CSV column');
    for (const required of ['uts','artist','album','track']) if (!headers.includes(required)) throw new Error(`Missing CSV column: ${required}`);
    if (headers.some(h => ['__proto__','constructor','prototype'].includes(h))) throw new Error('Reserved CSV column');
    return headers;
  }});
  if (!records.length) throw new Error('Source contains no listening events');
  const occurrences = new Map();
  let duplicateOccurrences = 0;
  const events = records.map((record,index) => {
    const timestamp = Number(record.uts);
    if (!/^\d+$/.test(record.uts) || !Number.isSafeInteger(timestamp) || timestamp <= 0 || timestamp > 8640000000000) throw new Error(`Invalid timestamp at source row ${index+2}`);
    requireText(record.artist, `artist at source row ${index+2}`);
    requireText(record.track, `track at source row ${index+2}`);
    const key = eventKey(timestamp, record.artist, record.track, record.album);
    const occurrence = (occurrences.get(key) || 0) + 1;
    occurrences.set(key,occurrence);
    if (occurrence > 1) duplicateOccurrences++;
    const sourceEventId = sha256(JSON.stringify(['lastfm',account,key,occurrence]));
    return new ListeningEvent({ id:`lastfm:listen:${sourceEventId}`, name:`${record.artist} — ${record.track}`, properties:{
      listenedAt:timestamp, sourceAccount:account, sourceEventId,
      submittedArtist:record.artist, submittedTitle:record.track, submittedAlbum:record.album,
      source:'lastfm-csv', sourceHash, sourceRow:index+2, sourceOccurrence:occurrence,
      rawSource:record, evidenceBasis:'submitted-history',
    }});
  });
  return {events, duplicateOccurrences, sourceHash};
}

/** Reconcile exact source observations. Conflicting or absent matches stay unresolved. */
function reconcileListens(events, listens, {account, sourceHash}) {
  requireText(account,'ListenBrainz account');
  requireText(sourceHash,'ListenBrainz sourceHash');
  if (!Array.isArray(listens)) throw new Error('ListenBrainz export must contain a listens array');
  const byKey = new Map();
  for (const listen of listens) {
    const meta = listen.track_metadata;
    if (!Number.isSafeInteger(listen.listened_at) || !meta || typeof meta.artist_name !== 'string' || typeof meta.track_name !== 'string') throw new Error('Invalid ListenBrainz exported listen');
    const key = eventKey(listen.listened_at,meta.artist_name,meta.track_name,meta.release_name || '');
    if (!byKey.has(key)) byKey.set(key,[]);
    byKey.get(key).push(listen);
  }
  let matchedEvents = 0, providerMatchedEvents = 0;
  const recordingMbids = new Set(), usedKeys = new Map();
  const mappings = events.map(event => {
    const p = event.properties;
    const key = eventKey(p.listenedAt,p.submittedArtist,p.submittedTitle,p.submittedAlbum);
    const group = byKey.get(key) || [];
    const used = usedKeys.get(key) || 0;
    const candidates = used < group.length ? group : [];
    if (candidates.length) { matchedEvents++; usedKeys.set(key,used+1); }
    const claims = candidates.map(l => l.track_metadata.mbid_mapping?.recording_mbid).filter(Boolean);
    const valid = claims.every(id => typeof id === 'string' && MBID.test(id));
    const ids = [...new Set(claims.filter(id => typeof id === 'string').map(id => id.toLowerCase()))];
    const resolved = valid && ids.length === 1;
    const reason = !candidates.length ? 'absent-from-export' : !valid ? 'invalid-provider-mbid' : ids.length > 1 ? 'conflicting-provider-matches' : !ids.length ? 'provider-unmapped' : 'provider-match-not-human-verified';
    if (resolved) { recordingMbids.add(ids[0]); providerMatchedEvents++; }
    return new IdentityMapping({id:`listenbrainz:mapping:${sha256(JSON.stringify([account,event.id,sourceHash]))}`,name:`ListenBrainz match for ${event.name}`,properties:{
      sourceId:event.id, ...(resolved ? {targetId:`musicbrainz:recording:${ids[0]}`} : {}),
      method:'listenbrainz-export-exact-event',status:resolved?'provider-matched':'unresolved',
      reason, source:'listenbrainz', sourceAccount:account, sourceHash,
      evidenceBasis:'provider-mapping', providerEvidence:candidates,
    }});
  });
  return {mappings, matchedEvents, unmatchedEvents:events.length-matchedEvents, providerMatchedEvents,
    recordingMbids:[...recordingMbids].sort(), extraExportEvents:[...byKey].reduce((sum,[key,values])=>sum+values.length-(usedKeys.get(key)||0),0)};
}

function readListenExport(sourcePath, account) {
  if (fs.statSync(sourcePath).isDirectory()) {
    const userBytes=fs.readFileSync(path.join(sourcePath,'user.json'));
    const user=JSON.parse(userBytes);
    if(user.username!==account) throw new Error('ListenBrainz export account mismatch');
    const listens=[], hashes=[['user.json',sha256(userBytes)]];
    const base=path.join(sourcePath,'listens');
    for (const year of fs.readdirSync(base).sort()) {
      if(!/^\d{4}$/.test(year) || !fs.lstatSync(path.join(base,year)).isDirectory()) throw new Error('Unexpected export year directory');
      for(const month of fs.readdirSync(path.join(base,year)).sort()) {
        if(!/^(?:[1-9]|1[0-2])\.jsonl$/.test(month)) throw new Error('Unexpected export month file');
        const file=path.join(base,year,month);
        if(!fs.lstatSync(file).isFile()) throw new Error('Export month must be a regular file');
        const bytes=fs.readFileSync(file);
        hashes.push([`listens/${year}/${month}`,sha256(bytes)]);
        for(const line of bytes.toString('utf8').split(/\r?\n/)) if(line.trim()) listens.push(JSON.parse(line));
      }
    }
    return {listens,sourceHash:sha256(JSON.stringify(hashes))};
  }
  const bytes=fs.readFileSync(sourcePath), text=bytes.toString('utf8').replace(/^\uFEFF/,'');
  let data;
  try { data=JSON.parse(text); } catch {
    data=text.split(/\r?\n/).filter(line=>line.trim()).map(line=>JSON.parse(line));
  }
  const listens=Array.isArray(data)?data:data.listens || data.payload?.listens;
  if (!Array.isArray(listens)) throw new Error('Unrecognized export structure; expected JSON listens or NDJSON');
  return {listens,sourceHash:sha256(bytes)};
}

/** Disk-only preparation; the module deliberately imports no environment or database client. */
function prepareHistory({sourcePath,outputDir,account,listenbrainzPath,listenbrainzAccount}) {
  const source=fs.readFileSync(sourcePath);
  const prepared=parseHistoryCsv(source,account);
  const exported=listenbrainzPath?readListenExport(listenbrainzPath,listenbrainzAccount):null;
  const reconciled=exported?reconcileListens(prepared.events,exported.listens,{account:listenbrainzAccount,sourceHash:exported.sourceHash}):null;
  const identity={version:VERSION,sourceHash:prepared.sourceHash,account,listenbrainz:exported?{account:listenbrainzAccount,sourceHash:exported.sourceHash}:null};
  const manifestPath=path.join(outputDir,'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const existing=JSON.parse(fs.readFileSync(manifestPath,'utf8'));
    if (JSON.stringify(existing.input)!==JSON.stringify(identity)) throw new Error('Prepared input differs; use a new output directory');
    for (const name of ['events.ndjson',...(exported?['mappings.ndjson','recording-mbids.json']:[])]) {
      if (!existing.files?.[name] || sha256(fs.readFileSync(path.join(outputDir,name)))!==existing.files[name]) throw new Error(`Prepared file checksum mismatch: ${name}`);
    }
    return existing;
  }
  fs.mkdirSync(outputDir,{recursive:true});
  if (fs.readdirSync(outputDir).length) throw new Error('Output directory is not empty; preserve it and choose a new directory');
  const files={};
  function write(name,content) {
    fs.writeFileSync(path.join(outputDir,name),content,{flag:'wx'});
    files[name]=sha256(content);
  }
  write('events.ndjson',prepared.events.map(e=>JSON.stringify(e.toGraphNode())).join('\n')+'\n');
  if(reconciled) {
    write('mappings.ndjson',reconciled.mappings.map(e=>JSON.stringify(e.toGraphNode())).join('\n')+'\n');
    write('recording-mbids.json',JSON.stringify(reconciled.recordingMbids,null,2)+'\n');
  }
  const timestamps=prepared.events.map(e=>e.properties.listenedAt);
  const manifest={input:identity,createdAt:new Date().toISOString(),state:'prepared',databaseWritten:false,
    counts:{events:prepared.events.length,duplicateOccurrences:prepared.duplicateOccurrences,...(reconciled?{
      matchedExportEvents:reconciled.matchedEvents,unmatchedExportEvents:reconciled.unmatchedEvents,
      providerMatchedEvents:reconciled.providerMatchedEvents,distinctRecordingMbids:reconciled.recordingMbids.length,extraExportEvents:reconciled.extraExportEvents}: {})},
    earliestListen:Math.min(...timestamps),latestListen:Math.max(...timestamps),files};
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n',{flag:'wx'});
  return manifest;
}
module.exports={parseHistoryCsv,reconcileListens,readListenExport,prepareHistory,sha256};
