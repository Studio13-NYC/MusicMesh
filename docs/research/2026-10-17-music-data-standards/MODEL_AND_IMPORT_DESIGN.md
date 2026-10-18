# MusicMesh: domain model and personal-history import

**17 October 2026 — approved direction; implementation in progress.**

Execution amendment: the user approved repository cleanup, tagging, commit/push, and beginning implementation. They reaffirmed that the previous generated database data is not needed. The replacement process may delete it; permanent preservation or dataset partitioning is not required. The replacement procedure below supersedes the earlier proposal to retain inactive datasets. See the [implementation plan](../../plans/2026-10-17-brainz.md) and [running progress report](../../product/BRAINZ_PROGRESS.md) for actual completion state.

This updates the scope of [the research report](REPORT.md). The objective is a catalog grounded in Nick's listening history, with explicit domain classes, MusicBrainz semantics, and acoustic connections. It is not a full MusicBrainz mirror. Implementation has since begun; the running progress report distinguishes implemented code, isolated imports and pending production activation.

## Intended outcome

- Import the 21,415 historical plays already captured in the original Last.fm CSV and submitted to ListenBrainz. Reconcile later ListenBrainz additions separately; do not silently change the baseline count.
- Fetch available catalog data for the identified recordings, their releases, works, artists, credits, and directly relevant context.
- Disregard the previous generated graph when resolving identities, answering from the new catalog, and calculating connections. Delete it during verified replacement; do not reinterpret its claims as imported facts.
- Improve the actual domain structure with classes and validation. Keep the object-oriented entity/relationship approach, Prisma, PostgreSQL, the graph API shape, and the chat/workbench product.
- Make semantic definitions immediately accessible to coding agents and runtime agents, including meanings, allowed endpoints, identity rules, provenance, and invalid interpretations.
- Import available AcousticBrainz analyses for recordings in this collection, then derive explainable similarities within the collection.

## Verified starting point

Current code has generic Prisma `Entity`, `Relationship`, and `ImportBatch` models, a set of 58 accepted node labels, and open-ended relationship names. It does **not** have individual domain classes enforcing what a Work or Recording means. The graph was rechecked in a read-only transaction: 312 entities, 505 relationships; all entities have `source: chat`.

Relevant paths: `prisma/schema.prisma`, `src/graphDomainWriter.js`, `src/graphProperties.js`, `src/graphCanonRepository.js`, `src/graphChatOrchestrator.js`, `src/graphPreview.js`, `src/chatService.js`, `src/graphStore.js`, `scripts/syncForSwaApi.js`, and `ui/src/graph-demos/graphFilterCatalog.json`.

The original file is `data-lastfm/recenttracks-bobdobbsnyc-1792084706.csv`. Its earlier profile found 21,415 unique timestamp/artist/title combinations, 9,264 distinct artist/title strings, and 7,009 distinct populated source track MBIDs. These are different denominators: none establishes the number of verified recordings. Preserve the CSV and existing ListenBrainz import receipt.

On this pass, the public ListenBrainz API returned mapped recording IDs. AcousticBrainz's count endpoint returned 27 submissions for “Severed” by The Decemberists, recording `bf7c0045-d389-4ef9-9df4-0a375000076c`; two other recent recordings had no returned count entries. A low-level document for Severed was retrieved successfully. MusicBrainz's direct recording endpoint returned HTTP 503 again. These checks establish access and one example, not whole-history coverage or correct identity for every listen.

## Architectural choice

**Recommended:** explicit JavaScript domain classes over the existing Prisma entity/relationship graph, with stronger identity, dataset, and validation rules. This improves the domain model without replacing the storage and traversal architecture.

Alternative: separate Prisma tables for every MusicBrainz class. This gives more database-level field typing but requires a substantial rewrite of generic graph traversal and API projection. It is unnecessary for the first history import.

Alternative: labels plus prose only. This is smaller but leaves invalid type combinations and ambiguous identities writable. It does not meet the request for improved classes.

### Domain classes

Introduce a domain module under `src/domain/`. Each concrete entity class has construction/validation, identity rules, serialization to the existing graph shape, and a semantic definition. Shared persistence belongs in one repository adapter; individual classes do not open database connections.

Core classes: `Artist`, `Recording`, `Release`, `ReleaseGroup`, `Work`, `Label`, `Area`, `Place`, `Event`, `Instrument`, `Genre`, `Series`, and `Url`. Add `Medium`, `Track`, and `ArtistCredit` as structural classes. Medium and ArtistCredit must not be assigned invented MusicBrainz entity MBIDs. Track identity is distinct from its recording identity.

MusicMesh additions needed for this task: `ListeningEvent`, `IdentityMapping`, `AcousticAnalysis`, and `SimilarityAssessment`. Retain documented local classes for scenes, sessions, equipment, techniques, and evidence; they receive no invented imported instances.

Relationships are objects with typed endpoints and validation. Explicit structural classes cover release membership, media, tracks, credits, listening mappings, and acoustic evidence. MusicBrainz relationship variants use its relationship-type identifier and definition, not an independently guessed English predicate. Share implementation through a base relationship class and registry; do not hand-copy hundreds of nearly identical subclasses.

### Prisma storage and replacement

Retain `Entity` and `Relationship` as the graph persistence models. Use canonical type plus namespaced provider identity, backed by database uniqueness where applicable. Never resolve new imports against the old name-derived graph.

Make relationship identity include its actual source assertion/context rather than only source/type/target. Enforce valid endpoints and preserve parallel contributions and dated membership episodes.

All read and write paths must use the replacement catalog: search, node inspection, graph traversal, grounding, chat writes, schema inspection, cached graph history, and statistics. Drain pending jobs before replacement. Old conversation/view identifiers must not bring excluded facts back into grounding.

Prepare records outside live tables and validate in an isolated database. Deploy compatible runtime, pause writes, remove obsolete relationships before entities, import prepared records, verify the receipt, then resume. A partial load stays explicitly incomplete; do not reopen writes as if it succeeded. Permanent dataset partitioning and preservation of unwanted graph data are not required.

The hosting target remains the dedicated MusicMesh Neon database, accessed through Prisma. This proposal does not move the service to Prisma Postgres or create a full catalog mirror.

## Semantics: one source used by code and agents

Each class references one machine-readable definition in the domain catalog. Generate human-readable documentation from the same definitions; do not maintain conflicting copies of meanings in prompts, UI lists, and prose.

Every entity definition includes:

- Stable type key, namespace (`musicbrainz`, `musicmesh`, or a structural mapping), semantic version, plain-English definition, and official source URL where applicable.
- Identity rule, required fields, field types and units, optional fields, date precision rules, and external-identifier rules.
- Distinctions from neighboring concepts, valid examples, and counterexamples.
- Classification: aligned, redundant alias, incompatible/ambiguous legacy type, or MusicMesh addition. Include replacement guidance where appropriate.

Every relationship definition additionally includes:

- Source and target classes, source-to-target reading, inverse reading, and whether it is directional or symmetric.
- Provider relationship-type ID when applicable; required contextual attributes, ordered credit handling, cardinality, and identity/deduplication rules.
- What evidence supports it, which inferences it does **not** license, and how dates/roles/uncertainty are represented.

Access paths to implement:

1. `src/domain/index.js`: import classes and `getOntology()` / `getTypeDefinition(key)` without requiring a database connection.
2. A read-only `/api/ontology` endpoint with the catalog version and definitions. Include the route in both local and Azure Functions implementations.
3. A short pointer in root `AGENTS.md` and generated `docs/product/DOMAIN_MODEL.md` for newly arriving agents.
4. Inject core distinctions plus relevant definitions into answer, preview, planning, and grounding contexts. Give tools the definition/version with returned entities and relationships. The initial answer path must receive semantics too.
5. Use the same catalog in writer validation, importer validation, UI type descriptions, and ontology-review output. Include the domain files in the explicit Azure bundle copy list.

Prompt text alone is insufficient. Reject invalid endpoints, unsupported types, missing identity, or invalid units at the repository boundary. Return a useful validation error. Do not silently turn failed validation into a generic Entity.

### Example definitions

| Type | Meaning and identity | Important non-inference |
|---|---|---|
| Work | An intellectual musical creation, identified by Work MBID when resolved. | The composition is not a particular performance, audio file, or streaming track. |
| Recording | A particular recorded audio version, identified by Recording MBID. | Same title, remaster label, or release-group membership does not by itself establish recording identity. |
| ReleaseGroup | A grouping of editions representing an album/single/EP concept. | It does not identify the edition the listener played. |
| Release | A particular issued edition, including its supplied publication details. | The release chosen by a matching service is not automatically the listener's exact edition. |
| Track | A position and credit on a particular release medium that references a recording. | It is not interchangeable with Recording, despite Last.fm's use of “track.” |
| Artist | A music professional or artistic identity with a provider subtype. | Producer and engineer are contextual roles, not separate duplicate people. |
| ListeningEvent | A timestamped submitted play with preserved original text and source identity. | A play is not proof of liking, completion, ownership, or an exact release match. |
| IdentityMapping | An assertion linking submitted identifiers/text to a catalog entity, with method and status. | A suggested or provider-canonical match is not a verified exact audio version. |
| AcousticAnalysis | One analysis submission for a recording, retaining extractor/version and source audio properties. | A feature value is not an intrinsic, universally agreed property of every audio file with that title. |
| SimilarityAssessment | A versioned comparison supported by named analyses/features, cohort, and metric. | Acoustic proximity does not imply shared personnel, influence, a cover, or user preference. |

Examples of typed connections:

- `Release → ReleaseGroup`: edition belongs to this group.
- `Release → Medium → Track → Recording`: preserve ordered containment and referenced audio identity.
- `Recording → Work`: use the actual MusicBrainz performance relationship definition/direction; preserve cover/live/other attributes when supplied.
- `Artist → Recording`: instrumental/vocal/production role only when the source supports that exact contribution. Main artist credit alone is not an instrument credit.
- `ListeningEvent → IdentityMapping → Recording`: keep original submission and current mapping distinguishable.
- `AcousticAnalysis → Recording`: analysis submitted for that recording ID; preserve submission offset and content hash.
- `SimilarityAssessment → Recording` for both participants, plus links to the supporting analyses. A display-only recording-to-recording shortcut must resolve back to this assessment.

Dates retain source precision (`YYYY`, `YYYY-MM`, or `YYYY-MM-DD`); unknown dates remain unknown. Durations use explicit units. Provider match scores, classifier probabilities, acoustic distances, and identity confidence are different fields and must never share an undifferentiated `confidenceScore` meaning.

## Crosswalk for all 58 accepted legacy labels

This is a vocabulary disposition, **not** a migration of the old generated instances.

| Existing labels | Disposition and canonical destination |
|---|---|
| Artist | Align with MusicBrainz Artist, including provider subtype. |
| Band, Person | Redundant top-level identity classes for this music catalog; use Artist with Group/Person subtype. Keep readable UI terms. |
| Member, Contributor, Producer, Engineer | Role labels, not identities. Use Artist plus typed contextual relationships. |
| Album | Ambiguous legacy class. Album concept becomes ReleaseGroup; a documented edition becomes Release. No mechanical conversion. |
| Release | Align; require edition semantics. |
| Recording | Align; preserve recording identity and version distinctions. |
| Track | Keep only for a release-medium track position. Legacy uses meaning “song/audio” are incompatible. |
| Song, Composition | Redundant or ambiguous. Use Work for composition; Recording for recorded audio. |
| Work | Align. |
| Credit, Contribution | Replace ambiguous generic objects with ArtistCredit for billing or a typed contribution relationship. A separate local contribution event needs an explicit event meaning. |
| RecordLabel, Label | Consolidate to Label. |
| Scene, MusicScene | Consolidate to MusicScene, a MusicMesh addition with evidence and geographical/temporal context. |
| Genre | Align vocabulary; genre assignment remains a sourced assertion. |
| Style | Keep as attributed tag/concept only when its distinct meaning is specified; do not automatically equate it with Genre. |
| Place | Align to physical Place. Geographic legacy instances belong to Area. |
| City, State, Country | Area subtypes, not separate identity classes. |
| Venue, Studio, StudioRoom, Room | Place with a suitable subtype/context. Room containment remains explicit; retain local subtype when provider has no equivalent. |
| RecordingSession, Session | Consolidate to RecordingSession, a MusicMesh addition. |
| StudioEvent | Ambiguous legacy catch-all; resolve to RecordingSession or a documented Event with explicit meaning. |
| Project, ArtistProject | MusicMesh project concept when distinct; use Artist only when it denotes an actual artistic identity. Consolidate duplicate project labels. |
| Mix, Master, Stem | MusicMesh production objects with explicit audio/version semantics. A released mix may also resolve to a Recording; a master is not automatically a new Recording. |
| Instrument | Align instrument vocabulary; distinguish it from a model or physical item. |
| Equipment, Amplifier, Effect, EffectsPedal, Guitar, Synthesizer, Console | MusicMesh equipment hierarchy. Guitar/Synthesizer as musical instrument types map to Instrument; make/model instances are equipment. Effect as processing method belongs to Technique, not automatically equipment. |
| SignalChain | MusicMesh addition with ordered components and context. |
| Manufacturer, Company | Company identity with manufacturer role. Do not equate every company with a record Label. |
| Technique, Process | MusicMesh additions; consolidate aliases only when definitions coincide. |
| Format | Controlled format value/concept; not an issued Medium. Preserve provider vocabulary. |
| Medium | Align to component of a Release, with position and format. |
| Technology | MusicMesh addition, defined separately from equipment and technique. |
| Source, Evidence, Reference | SourceDocument and EvidenceAssertion semantics; Reference is a citation/reference value unless independently meaningful. Preserve provenance rather than duplicate unnamed source nodes. |
| Entity | Abstract base only; reject as a final imported or chat-created type. |

New aligned types absent from the old allow-list: ReleaseGroup, Area, Event, Series, Url, ArtistCredit. Other additions needed for this import: ListeningEvent, IdentityMapping, AcousticAnalysis, SimilarityAssessment, and structured provider tag assertions. Typed fields may suffice for tags until independently navigable tag entities are useful.

## Crosswalk for all 56 observed legacy relationship names

Names alone cannot identify a MusicBrainz relationship. These dispositions describe the replacement contract; select the provider relationship-type ID using its definition and endpoint types. Do not manufacture IDs or transfer the old assertions.

| Existing predicates | Disposition |
|---|---|
| MEMBER_OF | Map to MusicBrainz membership where endpoints/subtypes and dates support it. |
| RELEASED_ALBUM, RELEASED_MUSIC_BY, RELEASED_BY, RELEASED_RECORDING | Ambiguous shortcuts. Separate main artist credits, edition/group containment, and publishing-label information. |
| IS_A_TRACK_ON | Replace with precise release/medium/track containment and track-to-recording reference. |
| RELEASED_ON_LABEL | Release label information with catalog number, not generic artist-to-label association. |
| PRODUCED_BY, ENGINEERED_BY | Normalize to provider contribution type, direction, endpoints, and context. |
| PERFORMED_ON, CONTRIBUTED_TO, PLAYED_INSTRUMENT, USES_INSTRUMENT, FEATURED_INSTRUMENT | Separate a recording credit, general artist-instrument association, and evidence about audible instrumentation. Select exact type; never infer one from another. |
| RECORDED_SONG, RECORDED_TRACK, RECORDED_BY | Ambiguous. Split main artist credit, performance-of-work, and actual recording/engineering credit. |
| WROTE | Work-level composer/lyricist/writer relationship as supported; never assume “wrote” means both music and lyrics. |
| COVERED_SONG, ORIGINALLY_PERFORMED_BY | Work/recording performance context and documented attributes. “Original” needs evidence, not earliest local date. |
| RECORDED_AT | Provider recording-location relationship when available; RecordingSession location is a local extension. |
| LOCATED_IN, ASSOCIATED_WITH_PLACE, FORMED_IN, BORN_IN, BASED_IN, HEADQUARTERED_AT | Distinguish Place-to-Area containment, artist begin/end/general area, residency, and company headquarters. Generic association is insufficient. |
| PERFORMED_AT, PLAYED_FIRST_SHOW_AT, ASSOCIATED_WITH_VENUE, ASSOCIATED_WITH_STUDIO | Use documented Event/Place/Artist participation or specific local claim. First-show assertions need historical evidence. |
| SIGNED_TO, RECORDED_FOR, PRODUCED_FOR, MANAGED_BY, FOUNDED_BY, WORKED_AT, HIRED | Preserve specific professional/organizational meaning and dates. Use an exact provider type when one fits; otherwise register a sourced MusicMesh relationship. |
| ASSOCIATED_WITH_GENRE, HAS_SUBGENRE | Attributed classification and genre hierarchy are separate. Do not invent a universal hierarchy from tags. |
| ASSOCIATED_WITH_SCENE, BREAKTHROUGH_RECORDING_FOR_SCENE, RELATED_SCENE | MusicMesh additions. Scene participation and interpretive significance require separately attributed evidence. |
| COLLABORATED_WITH, PLAYED_WITH, PEER_OF | Ambiguous summaries. Prefer concrete shared credits/events; keep any summary derived and explainable. |
| INFLUENCED, INFLUENCED_BY | Normalize a single direction for sourced influence assertions. Never derive influence from acoustic or listening similarity. |
| USES_TECHNIQUE, ASSOCIATED_WITH_TECHNIQUE, USED_AMPLIFIER, MANUFACTURED | MusicMesh additions with appropriate actor/object endpoints and evidence. |
| DERIVED_FROM | Too broad without context: work adaptation, recording remix, audio derivation, or technical lineage need distinct definitions. |
| RELEASED_IN | Release publication event/country/date when that is the intended meaning. Not automatically the artist's origin. |
| HAS_B_SIDE | Edition/medium/track ordering and format context; cannot safely infer a universal recording-to-recording relationship. |
| RELATED_TO | Reject for new persisted data until an explicit relationship meaning is identified. |

## Import scope and workflow

Environment correction from the user on 17 October: the deployed main backend is development; there is no production instance. Load the source history and currently available metadata into main now, with an explicit partial-enrichment receipt. Collection completeness and isolated full-dataset validation are not prerequisites for using that backend. Preserve source checks, typed identities and meaningful runtime verification; the remaining collection can continue independently.

1. **Baseline and recovery.** Validate the existing CSV checksum, columns, timestamps, row counts, and source-account identity. Record previous graph counts and prepare an isolated import target. Do not resend the CSV to ListenBrainz.
2. **Preserve plays first.** Construct one ListeningEvent per original source event. Deterministic source event identity must preserve repeated plays and distinguish true duplicate submissions. Use source account, UTC timestamp, original artist/title, and source record identity/occurrence where needed. Keep original strings and source MBIDs unmodified.
3. **Obtain mappings.** Use an authenticated ListenBrainz export for the full account rather than paging the entire public listens endpoint. Reconcile export events with the CSV and record additions/differences. Verify whether the export includes mappings; if it does not, use the documented metadata mapping/lookup route. Never presume export shape or fabricate mappings.
4. **Resolve identities.** Prefer validated, typed identifiers, recording redirect history, and explicit mapping provenance. Preserve candidates and unresolved events. Neither equal titles nor a provider's canonical grouping proves an exact version. A Last.fm track MBID requires type validation.
5. **Fetch catalog closure.** For resolved listened recordings, fetch available metadata and relationships; resolve linked works and credited artists. Fetch identified release/release-group context, ordered media/tracks for those releases, labels, places, areas, instruments, URLs, and events where actually referenced. Complete provider pagination. Retain sibling tracks needed for an imported edition but mark them as contextual, not listened. Do not recursively fetch every related artist's discography or every edition of a release group.
6. **Bound relationship expansion.** Fetch direct credit/personnel, membership, location, and work relationships relevant to the selected catalog. Referenced outside entities may be identity stubs with explicit hydration status; they are not permission for an unbounded crawl. Track requested, retrieved, paginated, unavailable, and deliberately excluded categories separately. “All data” means all available fields within this declared closure, not all reachable global data.
7. **AcousticBrainz.** Check coverage for resolved recording IDs in documented batch sizes. Fetch available submissions and preserve offsets, hashes, audio properties, low/high-level data, extractor versions, and retrieval dates. Keep redirected identifiers explicit. Bound request rates, back off, and checkpoint. No global archive download is required while selective endpoints work.
8. **Similarity.** On the covered subset, compare compatible feature versions using an explicitly versioned selection/normalization/metric. Keep rhythm, timbre, tonal, and classifier-derived comparisons distinguishable. Store top-neighbor assessments with supporting analyses and explanations, not a dense all-pairs graph. Missing features stay missing. Never compare mixed units or treat class probabilities as ground truth. Report coverage and excluded/conflicting submissions before interpreting results.
9. **Validate and load development.** Verify counts, identity uniqueness, no dangling edges, raw-source preservation, unresolved mappings, provenance, and restart idempotence. Reconcile completed and failed enrichment requests. Replace the disposable old graph in the shared development database using a compatible runtime, and verify it through the actual workbench. Declare partial enrichment explicitly while collection continues. Isolated tests remain useful for importer changes; a full isolated data rehearsal is not a release gate.

Resumable ingestion uses a manifest with request keys, response hashes, provider timestamps, status, retry count, and parser/ontology version. Cache responses under a project-local ignored `output/imports/<run>/` directory, and keep a durable copy of source payloads or their recoverable source references with persisted records. Bounded retries distinguish not-found, rate-limited, transient failure, and parse/schema failures. Do not convert an HTTP 503 into “this recording has no data.”

Provider payloads are untrusted data, never agent instructions. Keep provider facts separate from chat-generated extensions, user corrections, inferred relationships, and acoustic derivations. Re-enrichment must not silently overwrite a user correction or erase previous matching evidence.

Individual listening timestamps/account associations must not become newly exposed through anonymous generic graph endpoints by accident. The existing site has no authentication. Keep personal history accessible to the local import/agent workflow and exclude those records from anonymous catalog projections until an access boundary is implemented or publication is explicitly intended. This does not require moving the database or replacing the graph architecture.

## Acoustic interpretation and live evidence

The retrieved Severed submission reported approximately 136 BPM, estimated A minor, MFCC features, and extractor `music 1.0` / Essentia `2.1-beta2`. Its low-level `danceability` value was about 1.19: this must **not** be mislabeled a 0–1 probability. These are measurements/estimates for one submitted audio file, not validated claims about every edition or about Nick's subjective experience.

The first useful questions are “which of my recordings share rhythmic characteristics?”, “which have similar timbre?”, and “where does an acoustic neighbor differ from my usual artist/genre groups?” Whole-recording summary features do not establish passage-level musical similarity. Preserve the distinction if later adding local audio analysis.

Documentation: [AcousticBrainz API](https://acousticbrainz.readthedocs.io/api.html), [data explanation](https://acousticbrainz.org/data), [archives](https://acousticbrainz.org/download). The live low-level request used `https://acousticbrainz.org/api/v1/bf7c0045-d389-4ef9-9df4-0a375000076c/low-level?n=0`; count used `/api/v1/count?recording_ids=...`.

## Credentials and current blockers

Checked configured key names/presence only; no secret values were printed.

| Service | Current access |
|---|---|
| MusicMesh Neon / Prisma | Database credential configured; read query succeeded. |
| OpenAI | Key configured; this pass did not make a model call. |
| MusicBrainz public metadata | No API key needed for public reads. The initial HTTP 503 recovered; resumable recording retrieval is running with documented rate limit/backoff. |
| AcousticBrainz public data | No key needed for tested reads; count and low-level requests succeeded. |
| ListenBrainz | Official full export job 5949 was downloaded through signed-in Edge, including provider mappings. No account token was saved. |
| Last.fm | No key found in checked project configuration/process environment. CSV is sufficient for baseline import; live tags/similarity enrichment needs a key. |

Do not paste tokens into chat or store them in tracked files/logs. Signed-in browser access can supply an existing account token through a protected runtime path when required. Do not create new external applications just to read public MusicBrainz/AcousticBrainz data.

## Verification and definition of done

Required implementation checks:

- Every accepted entity/relationship has a definition; every legacy label and observed relationship type has a disposition.
- Work, Recording, ReleaseGroup, Release, and Track cannot be interchanged by constructors or import parsers.
- Relationship endpoint/type validation, partial dates, units, provider identity redirects, and duplicate titles are covered by meaningful fixtures.
- A repeated import creates no extra plays, catalog identities, or assertions; interrupted batches resume without loss.
- Duplicate acoustic submissions remain distinguishable; incompatible feature versions and missing fields do not produce spurious similarity scores.
- The replacement catalog is respected by search, traversal, direct node lookup, grounding, chat writes, and saved views. No previous generated claim is reused as evidence.
- Runtime prompts and `/api/ontology` expose the same semantic version; Azure build includes the catalog/classes.
- The workbench can find an imported recording, show its work/artist/release context, and explain one available acoustic connection using its stored evidence. Inspect database/logs separately from the answer.
- Produce a receipt showing baseline plays, later additions, matched/unresolved plays, distinct hydrated recordings, catalog/context entity counts, failed/pending requests, acoustic coverage by distinct recording and by listens, and activation state.

Existing commands for relevant validation are `npm test`, `npm run build`, and the isolated database test workflow documented in `package.json`. Root `.env` is the shared development backend. Use an explicitly selected isolated target for destructive test fixtures. Preparation, retrieval, compilation, source audit and explicit `load-main`/`load-isolated` commands exist; see [HISTORY_IMPORT.md](../../product/HISTORY_IMPORT.md). `load-main` accepts partial enrichment after source-integrity validation and only targets the named MusicMesh main database.

Acceptance is not “all 21,415 plays matched.” Acceptance is all original events preserved, every claimed identity/enrichment supported, unresolved or unavailable data reported, and the new graph usable without contamination from prior iterations.

## Source references

Implementation ruling, 17 October: the first AcousticBrainz feature pass retrieves offset 0 for each of the 7,220 available mapped recordings. Preserve the 391,369-submission count as coverage evidence; do not download or average all those submissions. Each compact AcousticAnalysis keeps its offset, content hash, extractor version, audio properties and explicitly named units. Full responses stay local. Similarity remains a subsequent version-compatible computation, not a property inferred from counts or shared names. The selected analysis may differ from the file originally scrobbled.

Typed chat enforcement is implemented and verified on isolated Neon. Ordinary chat receives selected-node context and a bounded public catalog neighborhood. Imported provider facts are read-only to chat; existing public acoustic analyses can be referenced but not fabricated. Existing incompatible legacy records do not enter matching candidates. The shared main development database now holds all source history and the completed first recording pass; see the running progress report for actual counts and remaining enrichment.

- [MusicBrainz schema](https://musicbrainz.org/doc/MusicBrainz_Database/Schema)
- [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API)
- [Relationships](https://musicbrainz.org/doc/Relationships) and [relationship catalog](https://musicbrainz.org/relationships)
- [Artist credits](https://musicbrainz.org/doc/Artist_Credits)
- [Recording guidelines](https://musicbrainz.org/doc/Style/Recording)
- [ListenBrainz export](https://listenbrainz.readthedocs.io/en/latest/users/api/export.html)
- [ListenBrainz metadata](https://listenbrainz.readthedocs.io/en/latest/users/api/metadata.html)
- [ListenBrainz submitted data and mapping semantics](https://listenbrainz.readthedocs.io/en/latest/users/json.html)

The implementation and operational choices in this document are MusicMesh design recommendations, not requirements imposed by these providers.


### Implemented acoustic comparison checkpoint (17 October)

The first-submission pilot now produces separate rhythm and timbre comparisons, using exactly compatible extractor/audio cohorts and population z-scores. Each SimilarityAssessment retains metric/version, cohort identity, supporting analysis IDs and measured feature differences. Missing features and small cohorts are reported as exclusions. Neighbor selection is recorded in the run receipt; pair evidence is independent of the number of neighbors requested. Full collection will produce a new cohort snapshot, not silently reuse pilot scores.

The 25-analysis pilot and 51 assessments are loaded in both validation and main development. MusicMesh's actual validation workbench explained a comparison from stored measurements and stated the small-cohort and first-submission limits. This establishes the comparison path; full acoustic collection remains in progress. Exact commands and receipts are in HISTORY_IMPORT.md and BRAINZ_PROGRESS.md.


### Selected-release closure ruling (17 October)

The baseline export supplies 2,655 release IDs. Fetch those exact editions, preserving them as provider-selected context rather than verified editions heard. Fetch direct listened-recording artists/works, edition groups/billing artists, then one layer of referenced context. Do not expand into artist discographies or every release-group edition. These exact lookups require no browse pagination; validate complete tracklists against counts. ReleaseLabel stores label-info/catalog-number semantics without inventing a provider relationship UUID. Native area fields remain raw provider references with typed context identities where present.

Catalog receipts bind to the seed recording responses and prepared history. Retrying a previously failed recording can change closure, so compilation rejects a stale closure manifest until recollected. Adaptive AcousticBrainz splitting preserves rate limits, successful caches and the consecutive-failure stop. Collectors write local artifacts; `load-main` separately loads available snapshots into the shared development backend.

### Recording relationship completeness and import audit (17 October)

The original recording pass did not request location/event/instrument and other relationship categories. The version-2 catalog pass now starts with all 13 relationship includes documented in the [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API#Relationships), then fetches the selected editions and bounded direct/context entities above. Relationship includes are distinct from capped release-list subqueries; no global discography or release-edition crawl is added. Outside related entities remain embedded unless independently selected. The broader recording payload takes precedence in compilation, while the initial response cache remains preserved. The queued worker has this implementation; successful live retrieval is still pending at this checkpoint.

The `audit-snapshot` command checks every original event, mapping and mapping link against checksummed prepared sources, reconciles recording IDs and validates actual graph class counts. It distinguishes an intact source history from completed enrichment and database/product verification. The real offline snapshot audit preserved all 21,415 plays and all 967 unresolved plays; it correctly reported remaining recording/catalog/acoustic phases. No database replacement happened as part of this audit. Serialized snapshot byte counts must not be mistaken for PostgreSQL capacity estimates.
