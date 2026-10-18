// Offline, provenance-preserving comparison of the ten tested album candidates.
// No network, provider requests or database access.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { catalogUrl, validateCatalog } = require('../../src/import/catalogClosure');
const root = path.resolve(__dirname, '../..');
const dir = path.join(root, 'output/roon-browse');
const prepared = path.join(root, 'output/imports/2026-10-17/prepared');
const cache = path.join(root, 'output/imports/2026-10-17/musicbrainz/responses');
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const norm = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase('en-US');
const key = (a, b) => JSON.stringify([norm(a), norm(b)]);
const manifest = JSON.parse(fs.readFileSync(path.join(prepared, 'manifest.json')));
function lines(name) {
  const bytes = fs.readFileSync(path.join(prepared, name));
  if (hash(bytes) !== manifest.files[name]) throw new Error(`Input checksum mismatch: ${name}`);
  return bytes.toString('utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
}
const probe = JSON.parse(fs.readFileSync(path.join(dir, 'ten-album-test.json')));
if (probe.state !== 'complete') throw new Error('Completed Roon probe required');
const albums = probe.albumTests.map((a, i) => ({ index: i, title: a.title, artist: a.artist, plays: a.plays,
  genres: a.genreMemberships.map(g => g.path), recordingIds: new Set(), eventCount: 0, mappedEvents: 0,
  cachedRecordings: 0, recordingsWithRelations: 0, recordingObservations: [], factors: new Map() }));
const byAlbum = new Map(albums.map(a => [key(a.title, a.artist), a]));
const eventAlbums = new Map();
for (const event of lines('events.ndjson')) {
  const a = byAlbum.get(key(event.properties.submittedAlbum, event.properties.submittedArtist));
  if (a) { a.eventCount++; eventAlbums.set(event.id, a); }
}
for (const mapping of lines('mappings.ndjson')) {
  const p = mapping.properties;
  const a = eventAlbums.get(p.sourceId);
  if (!a || !p.targetId?.startsWith('musicbrainz:recording:') || p.status !== 'provider-matched') continue;
  a.mappedEvents++; a.recordingIds.add(p.targetId.slice('musicbrainz:recording:'.length));
}
const missing = new Set();
const cached = new Map();
function read(type, id) {
  const url = catalogUrl(type, id);
  if (cached.has(url)) return cached.get(url);
  const filename = path.join(cache, hash(url) + '.json');
  if (!fs.existsSync(filename)) { missing.add(url); cached.set(url, null); return null; }
  const r = JSON.parse(fs.readFileSync(filename));
  if (r.url !== url) throw new Error('Cached URL mismatch');
  if (r.status !== 'ok') { missing.add(url); cached.set(url, null); return null; }
  if (hash(JSON.stringify(r.body)) !== r.bodyHash) throw new Error('Cached body checksum mismatch');
  validateCatalog(type, r.body); cached.set(url, r); return r;
}
function add(a, identity, type, name, evidence) {
  const f = a.factors.get(identity) || { id: identity, type, name, evidence: [] };
  if (!f.evidence.some(e => e.recordingId === evidence.recordingId && e.sourceUrl === evidence.sourceUrl && e.role === evidence.role && JSON.stringify(e.attributes) === JSON.stringify(evidence.attributes))) f.evidence.push(evidence);
  a.factors.set(identity, f);
}
function relations(a, r, recording, scope) {
  for (const rel of r.body.relations || []) {
    const target = rel['target-type'];
    const entity = rel[target];
    const evidence = { recordingId: recording.id, recordingTitle: recording.title, role: rel.type,
      roleId: rel['type-id'], direction: rel.direction, attributes: rel.attributes || [], scope,
      sourceUrl: r.url, sourceHash: r.bodyHash, fetchedAt: r.fetchedAt };
    if (['artist', 'place', 'instrument'].includes(target) && entity?.id) {
      add(a, `musicbrainz:${target}:${entity.id}`, target, entity.name, evidence);
    }
    if (target === 'artist' && rel.type === 'instrument') {
      for (const attribute of rel.attributes || []) {
        if (['additional', 'guest', 'solo'].includes(attribute)) continue;
        add(a, `musicbrainz:instrument-attribute:${attribute}`, 'instrument-attribute', attribute, evidence);
      }
    }
  }
}
for (const a of albums) {
  for (const id of a.recordingIds) {
    const r = read('recording', id);
    if (!r) continue;
    a.cachedRecordings++;
    a.recordingObservations.push({ id: r.body.id, title: r.body.title, disambiguation: r.body.disambiguation,
      firstReleaseDate: r.body['first-release-date'], sourceUrl: r.url, sourceHash: r.bodyHash });
    if (r.body.relations?.length) a.recordingsWithRelations++;
    relations(a, r, r.body, 'recording');
    for (const rel of r.body.relations || []) {
      if (rel['target-type'] !== 'work' || rel.type !== 'performance' || !rel.work?.id) continue;
      const work = read('work', rel.work.id);
      if (work) relations(a, work, r.body, 'work-of-recording');
    }
  }
}
const pairs = [];
for (let i = 0; i < albums.length; i++) for (let j = i + 1; j < albums.length; j++) {
  const a = albums[i], b = albums[j];
  const recordings = [...a.recordingIds].filter(id => b.recordingIds.has(id));
  const shared = new Set(recordings);
  const factors = [...a.factors.values()].filter(f => b.factors.has(f.id)).map(f => {
    const other = b.factors.get(f.id);
    return { id: f.id, type: f.type, name: f.name,
      leftRecordings: [...new Set(f.evidence.map(e => e.recordingId))],
      rightRecordings: [...new Set(other.evidence.map(e => e.recordingId))],
      rolesLeft: [...new Set(f.evidence.map(e => e.role))], rolesRight: [...new Set(other.evidence.map(e => e.role))],
      independentlySupported: f.evidence.some(e => !shared.has(e.recordingId)) && other.evidence.some(e => !shared.has(e.recordingId)) };
  });
  pairs.push({ left: i, right: j, sharedRecordings: recordings, sharedFactors: factors });
}
const report = { createdAt: new Date().toISOString(), basis: 'Recordings linked by ListenBrainz to plays submitted under the ten album names. Not verified Roon editions or album-wide credits.',
  albums: albums.map(a => ({ ...a, recordingIds: [...a.recordingIds], factors: [...a.factors.values()] })), pairs,
  missingCachedResponses: [...missing], fetched: false, databaseWritten: false };
fs.writeFileSync(path.join(dir, 'relationships.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ coverage: report.albums.map(a => ({ album: a.title, recordings: a.recordingIds.length, cached: a.cachedRecordings, factors: a.factors.length })),
  sharedPeople: pairs.filter(p => p.sharedFactors.some(f => f.type === 'artist')).map(p => ({ a: albums[p.left].artist, b: albums[p.right].artist, sameRecordings: p.sharedRecordings.length,
    factors: p.sharedFactors.filter(f => f.type === 'artist').map(f => ({ name: f.name, left: f.rolesLeft, right: f.rolesRight, independent: f.independentlySupported })) })),
  sharedPlaces: pairs.filter(p => p.sharedFactors.some(f => f.type === 'place')).map(p => ({ a: albums[p.left].artist, b: albums[p.right].artist, factors: p.sharedFactors.filter(f => f.type === 'place') })), missing: missing.size }, null, 2));
