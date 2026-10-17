const { test } = require("node:test");
const assert = require("node:assert/strict");
const domain = require("../src/domain");
const mbid = "bf7c0045-d389-4ef9-9df4-0a375000076c";
const externalId = { provider: "musicbrainz", type: "recording", value: mbid };
const recording = () => new domain.Recording({ name: "Severed", externalId });

test("typed provider identity prevents Work/Recording substitution and name merging", () => {
  const a = recording();
  const b = new domain.Recording({ name: "Severed", externalId: { ...externalId, value: "2f6ba60a-5ebb-4856-a4bb-3d31adae806c" } });
  assert.notEqual(a.id, b.id);
  assert.equal(a.id, `musicbrainz:recording:${mbid}`);
  assert.throws(() => new domain.Work({ name: "Severed", externalId }), /external.*type/i);
  assert.throws(() => new domain.Recording({ name: "Severed" }), /identity/i);
  assert.throws(() => new domain.Recording({ name: "Severed", externalId: { ...externalId, value: "not-an-mbid" } }), /MBID/);
});

test("structural Track identity requires medium, position, and recording", () => {
  assert.throws(() => new domain.Track({ id: "track:1", name: "Severed" }), /mediumId/);
  const t = new domain.Track({ id: "track:1", name: "Severed", properties: { mediumId: "medium:1", position: 0, recordingId: recording().id } });
  assert.equal(t.toGraphNode().properties.position, 0);
  assert.equal(t.toGraphNode().labels[0], "Track");
  assert.throws(() => new domain.Medium({ name: "Disc", externalId }), /external.*type|external.*identity/i);
});

test("relationships validate endpoint types and keep parallel context identity", () => {
  const r = recording();
  const w = new domain.Work({ id: "local:work:1", name: "Composition" });
  const edge = new domain.PerformanceOf({ source: r, target: w, assertionKey: "source:1", properties: { evidenceBasis: "provider assertion" } });
  assert.equal(edge.toGraphRelationship().source, r.id);
  assert.equal(edge.toGraphRelationship().target, w.id);
  assert.throws(() => new domain.PerformanceOf({ source: w, target: r, assertionKey: "source:1" }), /source|endpoint/);
  const second = new domain.PerformanceOf({ source: r, target: w, assertionKey: "source:2" });
  assert.notEqual(edge.id, second.id);
  assert.throws(() => new domain.PerformanceOf({ source: r, target: w }), /assertionKey/);
});

test("artist credits preserve order, credited names and joining text", () => {
  const credits = [{ artistId: "artist:1", creditedName: "A", joinPhrase: " feat. " }, { artistId: "artist:2", creditedName: "B", joinPhrase: "" }];
  const c = new domain.ArtistCredit({ id: "credit:1", name: "A feat. B", properties: { credits } });
  credits[0].creditedName = "changed";
  assert.equal(c.toGraphNode().properties.credits[0].creditedName, "A");
  assert.equal(c.toGraphNode().properties.credits[0].joinPhrase, " feat. ");
  assert.throws(() => new domain.ArtistCredit({ id: "credit:2", name: "A", properties: { credits: [{ artistId: "artist:1" }] } }), /creditedName/);
});

test("date precision and duration units are preserved, invalid values rejected", () => {
  const r = new domain.Recording({ name: "A", externalId, properties: { firstReleaseDate: "2018-01", durationMs: 243000 } });
  assert.equal(r.properties.firstReleaseDate, "2018-01");
  for (const date of ["2018-13", "2019-02-29", "2020-02-30", "2020-00-01"]) {
    assert.throws(() => new domain.Recording({ id: "r", name: "A", properties: { firstReleaseDate: date } }), /date/i);
  }
  assert.throws(() => new domain.Recording({ id: "r", name: "A", properties: { durationMs: -1 } }), /durationMs/);
});

test("listening events retain submitted text and require completed-play time", () => {
  const properties = { listenedAt: 1792084706, sourceAccount: "lastfm:bobdobbsnyc", sourceEventId: "row:1", submittedArtist: "The Decemberists", submittedTitle: "Severed", submittedAlbum: "I'll Be Your Girl" };
  const listen = new domain.ListeningEvent({ id: "listen:1", name: "Severed", properties });
  assert.equal(listen.properties.submittedAlbum, "I'll Be Your Girl");
  assert.equal(listen.constructor.definition.visibility, "private");
  assert.throws(() => new domain.ListeningEvent({ id: "listen:2", name: "Now playing", properties: { ...properties, listenedAt: 0 } }), /listenedAt/);
});

test("acoustic analyses preserve extractor and do not mistake danceability for probability", () => {
  const properties = { recordingId: recording().id, submissionId: "0", extractorVersion: "music 1.0", features: { bpm: 136.0166, danceability: 1.1935 } };
  const analysis = new domain.AcousticAnalysis({ id: "ab:0", name: "Severed analysis", properties });
  assert.equal(analysis.properties.features.danceability, 1.1935);
  assert.throws(() => new domain.AcousticAnalysis({ id: "ab:0", name: "Analysis", properties: { ...properties, features: { bpm: NaN } } }), /finite|JSON/i);
});

test("similarity requires reproducible evidence and two distinct recordings", () => {
  const properties = { recordingIds: ["r:1", "r:2"], analysisIds: ["a:1", "a:2"], method: "euclidean", methodVersion: "1", featureFamily: "rhythm", cohortId: "history:1", score: 2.4, scoreMeaning: "distance" };
  const comparison = new domain.SimilarityAssessment({ id: "similarity:1", name: "Rhythm similarity", properties });
  assert.equal(comparison.properties.score, 2.4);
  assert.throws(() => new domain.SimilarityAssessment({ id: "s:1", name: "Same", properties: { ...properties, recordingIds: ["r:1", "r:1"] } }), /distinct/);
  assert.throws(() => new domain.SimilarityAssessment({ id: "s:1", name: "Unknown", properties: { ...properties, methodVersion: undefined } }), /methodVersion/);
});

test("ontology is immutable, JSON-safe, and explains deprecated vocabulary", () => {
  const ontology = domain.getOntology();
  assert.ok(ontology.version);
  assert.equal(JSON.parse(JSON.stringify(ontology)).entities.Recording.key, "Recording");
  assert.ok(domain.getTypeDefinition("Recording").notEquivalentTo.includes("Work"));
  assert.equal(ontology.legacyEntities.Album.status, "ambiguous");
  assert.equal(ontology.legacyEntities.Producer.replacement, "Artist");
  assert.ok(Object.isFrozen(ontology.entities.Recording));
  assert.throws(() => domain.getTypeDefinition("invented"), /Unknown/);
  assert.match(domain.getOntologyPrompt(), /not.*influence/i);
});

test("catalog definitions all have concrete constructors and legacy vocabulary is fully classified", () => {
  const ontology = domain.getOntology();
  for (const definition of Object.values(ontology.entities)) {
    assert.equal(typeof domain[definition.key], "function", definition.key);
    assert.equal(domain[definition.key].definition, definition);
  }
  const inventory = require("../docs/research/2026-10-17-music-data-standards/live-inventory.json");
  for (const key of Object.keys(inventory.relationshipTypes)) assert.ok(ontology.legacyRelationships[key], key);
  assert.equal(Object.keys(ontology.legacyEntities).length, 58);
});

test("structural edges cannot contradict referenced parent or recording identities", () => {
  const r = recording();
  const other = new domain.Recording({ id: "recording:other", name: "Other" });
  const t = new domain.Track({ id: "track:1", name: "Severed", properties: { mediumId: "medium:1", position: 1, recordingId: r.id } });
  assert.throws(() => new domain.UsesRecording({ source: t, target: other, assertionKey: "tracklist:1" }), /reference/);
  assert.equal(new domain.UsesRecording({ source: t, target: r, assertionKey: "tracklist:1" }).target, r.id);
});

test("unresolved identity mapping preserves absence of a target without inventing one", () => {
  const p = { sourceId: "listen:1", method: "provider", status: "unresolved" };
  const m = new domain.IdentityMapping({ id: "mapping:1", name: "Unresolved listen", properties: p });
  assert.equal(m.properties.targetId, undefined);
  assert.throws(() => new domain.IdentityMapping({ id: "mapping:2", name: "Missing verified target", properties: { ...p, status: "verified" } }), /targetId/);
});

test("generated semantic reference stays synchronized with the registry", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const { renderDomainModel } = require("../scripts/renderDomainModel");
  assert.equal(fs.readFileSync(path.join(__dirname, "../docs/product/DOMAIN_MODEL.md"), "utf8").replace(/\r\n/g, "\n"), renderDomainModel());
});

test("provider-prefixed raw IDs cannot bypass typed external identity validation", () => {
  for (const id of [`musicbrainz:work:${mbid}`, `MUSICBRAINZ:recording:${mbid}`, ` musicbrainz:recording:${mbid}`]) {
    assert.throws(() => new domain.Recording({ id, name: "Wrong identity" }), /externalId|identity/);
  }
  assert.throws(() => new domain.Medium({ id: `musicbrainz:medium:${mbid}`, name: "Fake MBID", properties: { releaseId: "release:1", position: 1 } }), /externalId|identity/);
});

test("conditionally required mapping targets cannot be blank", () => {
  for (const targetId of ["", "  "]) assert.throws(() => new domain.IdentityMapping({ id: "m:1", name: "Verified", properties: { sourceId: "listen:1", method: "human", status: "verified", targetId } }), /targetId/);
});
