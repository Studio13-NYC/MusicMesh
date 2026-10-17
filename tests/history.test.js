const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parseHistoryCsv, prepareHistory, reconcileListens, readListenExport } = require('../src/import/history');

const header = 'uts,utc_time,artist,artist_mbid,album,album_mbid,track,track_mbid\r\n';
const row = '1700000000,,Björk,,Debut,,"Human, Behaviour",unverified-id\r\n';
test('CSV parsing preserves quoted text, Unicode, raw IDs and every occurrence', () => {
  const result = parseHistoryCsv(header + row + row + row.replace('1700000000', '1700000100'), 'example');
  assert.equal(result.events.length, 3);
  assert.equal(result.duplicateOccurrences, 1);
  assert.equal(new Set(result.events.map(e => e.id)).size, 3);
  assert.equal(result.events[0].properties.submittedTitle, 'Human, Behaviour');
  assert.equal(result.events[0].properties.rawSource.track_mbid, 'unverified-id');
  assert.equal(result.events[0].externalId, null);
  assert.deepEqual(result.events.map(e => e.id), parseHistoryCsv(header + row + row + row.replace('1700000000', '1700000100'), 'example').events.map(e => e.id));
  assert.ok(Object.isFrozen(result.events[0].properties.rawSource));
});
test('invalid timestamps, missing/duplicate headers and malformed CSV fail instead of dropping rows', () => {
  for (const value of ['', '0', '-1', '1.2', '1e9', 'abc', '999999999999999999']) {
    assert.throws(() => parseHistoryCsv(header + row.replace('1700000000', value), 'example'), /timestamp/);
  }
  assert.throws(() => parseHistoryCsv('uts,artist\n123,A\n', 'example'), /column/);
  assert.throws(() => parseHistoryCsv(header.replace('utc_time', 'uts') + row, 'example'), /duplicate/i);
  assert.throws(() => parseHistoryCsv(header + '123,,A,,B,,"bad,\n', 'example'));
  assert.throws(() => parseHistoryCsv(header + row, ''), /account/);
});
test('multiline and escaped quote values survive; IDs ignore source ordering and unrelated rows', () => {
  const quoted = '1700000200,,"A ""quote""",,"Line\nTwo",,Title,\r\n';
  const a = parseHistoryCsv(header + row + quoted, 'example');
  const b = parseHistoryCsv(header + quoted + row, 'example');
  assert.equal(a.events[1].properties.submittedArtist, 'A "quote"');
  assert.equal(a.events[1].properties.submittedAlbum, 'Line\nTwo');
  assert.equal(a.events[0].id, b.events[1].id);
  assert.notEqual(a.events[0].id, parseHistoryCsv(header + row, 'other').events[0].id);
});
test('reconciliation uses exact submitted values and timestamp, never guessed names or Last.fm IDs', () => {
  const { events } = parseHistoryCsv(header + row + row.replace('1700000000', '1700000100'), 'example');
  const recording = 'bf7c0045-d389-4ef9-9df4-0a375000076c';
  const listen = { listened_at: 1700000000, track_metadata: { artist_name: 'Björk', track_name: 'Human, Behaviour', release_name: 'Debut', mbid_mapping: { recording_mbid: recording } } };
  const result = reconcileListens(events, [listen], { account:'lb-example', sourceHash:'export-hash' });
  assert.equal(result.matchedEvents, 1);
  assert.equal(result.unmatchedEvents, 1);
  assert.equal(result.mappings[0].properties.status, 'provider-matched');
  assert.equal(result.mappings[0].properties.targetId, 'musicbrainz:recording:' + recording);
  assert.equal(result.mappings[1].properties.status, 'unresolved');
  assert.equal(result.recordingMbids.length, 1);
  assert.equal(result.mappings[0].properties.sourceId, events[0].id);
  assert.equal(result.mappings[0].properties.sourceHash, 'export-hash');
  assert.equal(reconcileListens(events, [{...listen, listened_at:1700000200}], {account:'lb-example',sourceHash:'hash'}).matchedEvents, 0);
});
test('conflicting export matches and invalid MBIDs stay unresolved with evidence', () => {
  const {events} = parseHistoryCsv(header + row, 'example');
  const make = id => ({listened_at:1700000000,track_metadata:{artist_name:'Björk',track_name:'Human, Behaviour',release_name:'Debut',mbid_mapping:{recording_mbid:id}}});
  const conflict = reconcileListens(events, [make('bf7c0045-d389-4ef9-9df4-0a375000076c'), make('2f6ba60a-5ebb-4856-a4bb-3d31adae806c')], {account:'lb',sourceHash:'hash'});
  assert.equal(conflict.mappings[0].properties.status,'unresolved');
  assert.equal(conflict.mappings[0].properties.reason,'conflicting-provider-matches');
  const invalid = reconcileListens(events, [make('wrong')], {account:'lb',sourceHash:'hash'});
  assert.equal(invalid.mappings[0].properties.status,'unresolved');
  assert.equal(invalid.recordingMbids.length,0);
});
test('one exported listen cannot satisfy two duplicate source occurrences', () => {
  const {events}=parseHistoryCsv(header+row+row,'example');
  const listen={listened_at:1700000000,track_metadata:{artist_name:'Björk',track_name:'Human, Behaviour',release_name:'Debut',mbid_mapping:{recording_mbid:'bf7c0045-d389-4ef9-9df4-0a375000076c'}}};
  const result=reconcileListens(events,[listen],{account:'lb',sourceHash:'hash'});
  assert.equal(result.matchedEvents,1);
  assert.equal(result.mappings[1].properties.status,'unresolved');
});
test('preparation is deterministic and verifies existing payloads before resuming', () => {
  const root = path.join(__dirname,'..','output','tests');
  fs.mkdirSync(root,{recursive:true});
  const dir = fs.mkdtempSync(path.join(root,'history-'));
  try {
    const sourcePath=path.join(dir,'input.csv'), outputDir=path.join(dir,'prepared');
    fs.writeFileSync(sourcePath,header+row);
    const first=prepareHistory({sourcePath,outputDir,account:'example'});
    assert.equal(first.counts.events,1);
    assert.equal(first.databaseWritten,false);
    assert.deepEqual(prepareHistory({sourcePath,outputDir,account:'example'}),first);
    fs.appendFileSync(path.join(outputDir,'events.ndjson'),'corruption');
    assert.throws(()=>prepareHistory({sourcePath,outputDir,account:'example'}),/checksum/);
  } finally { fs.rmSync(dir,{recursive:true}); }
});
test('official export directories preserve all monthly listens and verify the account', () => {
  const root=path.join(__dirname,'..','output','tests');
  fs.mkdirSync(root,{recursive:true});
  const dir=fs.mkdtempSync(path.join(root,'export-'));
  try {
    fs.mkdirSync(path.join(dir,'listens','2026'),{recursive:true});
    fs.writeFileSync(path.join(dir,'user.json'),JSON.stringify({username:'example'}));
    fs.writeFileSync(path.join(dir,'listens','2026','1.jsonl'),JSON.stringify({listened_at:123})+'\n');
    fs.writeFileSync(path.join(dir,'listens','2026','2.jsonl'),JSON.stringify({listened_at:456})+'\n');
    assert.equal(readListenExport(dir,'example').listens.length,2);
    assert.throws(()=>readListenExport(dir,'wrong'),/account/);
  } finally {fs.rmSync(dir,{recursive:true});}
});
