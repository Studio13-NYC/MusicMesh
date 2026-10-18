# Personal history preparation and retrieval

Current checkpoint: 17 October 2026, New York. The user clarified that the deployed main backend is development; there is no production instance. Preparation and collection write local artifacts. `compile` creates a validated graph snapshot; `load-main` loads available data into the explicitly named main development database, and `load-isolated` remains available for the validation database. Partial enrichment does not block main imports. No command resubmits plays to ListenBrainz. The first recording pass completed all 8,289 lookups without errors; expanded catalog collection continues. Acoustic collection completed all 7,220 available recordings.

## Shared development backend

```powershell
# Initial replacement of the disposable old graph (already completed for snapshot 1):
node --env-file=.env scripts/importListeningHistory.js load-main --prepared output/imports/2026-10-17/prepared --snapshot output/imports/2026-10-17/main-development-snapshot-1 --replace-existing
# Replay that exact snapshot without deleting anything:
node --env-file=.env scripts/importListeningHistory.js load-main --prepared output/imports/2026-10-17/prepared --snapshot output/imports/2026-10-17/main-development-snapshot-1
```

Main host is `ep-noisy-king-aunaaru0-pooler.c-10.us-east-1.aws.neon.tech` (or its direct endpoint), database `musicmesh`, TLS `verify-full`. `load-main` rejects other projects/targets and audits source integrity before writes. It shares the existing batch loader with `load-isolated`; receipts are named `main-development-import-receipt.json` and retain exact snapshot hashes, created/verified counts and partial enrichment. No full-collection or production-release gate is imposed. Replacement deletes old relationships, entities and import receipts; subsequent exact replay uses immutable record checks. Use `--previous-snapshot <loaded directory>` for an additive refresh. The importer requires that baseline snapshot to have a verified import receipt in the same database. Changed rows update only if their current stored values exactly match the baseline; already-refreshed rows replay unchanged. Row locks and atomic batches protect corrections. Source identity and domain types must remain the same. Records omitted from the new snapshot remain stored, including historical comparison cohorts. This is an additive enrichment path, not deletion or a mirror of provider removals. Do not use replacement for routine enrichment.

Snapshot 1 is loaded: 76,779 entities/118,861 relationships, all 21,415 plays and 8,289 successful initial recording lookups, plus the existing 25-analysis/51-comparison acoustic pilot. PostgreSQL counts, deployed API reads and the actual Edge graph were verified. Snapshot 2 subsequently added all 7,220 acoustic analyses and full comparisons without resetting this history; see Full acoustic enrichment refresh below. Expanded MusicBrainz relation/edition data is still being collected. Individual plays and identity mappings remain excluded from anonymous graph endpoints; loading the development backend does not change that access boundary.

## Acoustic feature collection

Coverage completed: 7,220 available recordings, 1,069 absent, zero unknown; available recordings cover 17,766 plays. The feature pass selects the earliest submission (offset 0) for each available recording. This is a baseline sample of audio analyses, not a verified match to the audio file actually scrobbled or an average of duplicate submissions. Full provider documents remain in the ignored local cache; compact entities omit submitted filename tags and preserve extractor version, units, offset, content hash and count of available submissions. Missing features stay absent. Incompatible/malformed documents are reported as unsupported rather than invented.

```powershell
node scripts/importListeningHistory.js acoustic-features --prepared output/imports/2026-10-17/prepared --coverage output/imports/2026-10-17/acousticbrainz --cache output/imports/2026-10-17/acoustic-features
Get-Content output/imports/2026-10-17/acoustic-features/progress.json
Get-Content output/imports/2026-10-17/acoustic-features-resume-2.error.log
```

The original feature worker (PID 53132) stopped after timeouts. The resumed worker (PID 46252) completed at 00:43:53 UTC on 18 October: 7,220 collected, zero missing, unsupported or errors. Check progress before any resume. Do not run a second AcousticBrainz worker while it is active. The completed count worker is no longer needed. A stale lock may only be removed after verifying its PID is no longer alive. Repeating the command revalidates count evidence and cached responses. `--limit 25` produces a deliberately limited pilot. The final `manifest.json` hashes `analyses.ndjson`; `progress.json` distinguishes running/interrupted/limited/complete. Collection does not write the database, calculate similarity or make all 391,369 submissions part of the first pass. [Official bulk API and offset semantics](https://acousticbrainz.readthedocs.io/api.html).

## Verified inputs and reconciliation

The original Last.fm CSV has 21,415 plays. ListenBrainz export job 5949, requested through the signed-in export page, downloaded as `listenbrainz_nickknyc_1792270442.zip`. Its account is `nickknyc`; its monthly JSONL files contain all 21,415 original events. Every event reconciles by exact timestamp, submitted artist, track and album. There are no missing or extra exported events and no duplicate source occurrences.

ListenBrainz provides recording mappings for 20,448 plays (95.48%), covering 8,289 distinct recording MBIDs. The other 967 plays stay unresolved. Provider matches are not human verification of the recording/edition. Original Last.fm IDs stay under `rawSource`; their names do not establish their MusicBrainz entity type.

The untouched CSV SHA-256 is `3d08352ed6a56b1e8f1d33c36609d1807f6773fe67244aa97cfd9afe5ca0feff`. Its range is 17 August 2016 through 15 October 2026. Local inputs, exported account data, prepared files and caches are ignored by Git.

## Prepare and resume

Run from `D:\Studio13\Lab\Code\MusicMesh`:

```powershell
npm run brainz:import -- prepare --source data-lastfm/recenttracks-bobdobbsnyc-1792084706.csv --account bobdobbsnyc --output output/imports/2026-10-17/prepared --listenbrainz-export output/imports/2026-10-17/listenbrainz-export --listenbrainz-account nickknyc
```

The ListenBrainz argument accepts an extracted official export directory (`user.json` plus `listens/<year>/<month>.jsonl`), a JSON array/listens wrapper, or JSONL. Preserve the downloaded ZIP. Before extracting an unfamiliar archive, validate that every resolved entry path stays inside the destination. The current archive was checked this way and extracted into `output/imports/2026-10-17/listenbrainz-export`.

Preparation creates `events.ndjson`, `mappings.ndjson`, `recording-mbids.json`, and `manifest.json`. It constructs the domain classes and serializes their graph representation. It keeps every source occurrence and assigns deterministic IDs. Invalid timestamps/columns fail the operation; unresolved or conflicting matches are explicit. Repeating preparation with identical inputs verifies saved checksums and returns the original manifest. Changed inputs require a new output directory. An interrupted preparation without a manifest must be inspected and rerun into a fresh directory; it is not silently overwritten.

## First MusicBrainz pass

```powershell
npm run brainz:import -- fetch-recordings --prepared output/imports/2026-10-17/prepared --cache output/imports/2026-10-17/musicbrainz
```

This pass retrieves recording identity/title/length, ordered artist credits, work/artist/recording/URL relationships, genres, tags and ISRCs. Raw responses retain the requested URL, returned identity (including redirects), retrieval time, response hash and HTTP status. Releases are deliberately not included through the capped lookup subquery; later release retrieval must follow the selected listening-catalog scope and paginate where required. A recording response does not establish complete artist/work/release metadata.

The client serializes requests at least 1.1 seconds apart, identifies MusicMesh in User-Agent, honors Retry-After, retries transient failures up to three times, and stops after three consecutively failing recordings or a non-retryable client error. HTTP 404 is distinct from HTTP 429/503, network failure and invalid response. Cached successful payloads are checksum-verified and reused. Failed requests are retried on a later run. `--limit 3` restricts a diagnostic run to the first three IDs; it is not a full import.

Only one worker may use a cache directory. The `fetch.lock` file records its PID. Do not remove a lock until confirming that process is no longer running. Do not run separate cache workers concurrently against MusicBrainz: the one-request-per-second limit applies to the application, not each directory.

The full first pass was started as a hidden local Node process. Inspect actual progress instead of assuming it remains running:

```powershell
Get-Content output/imports/2026-10-17/musicbrainz/progress.json
Get-Content output/imports/2026-10-17/musicbrainz-fetch.log -Tail 5
Get-Content output/imports/2026-10-17/musicbrainz-fetch.error.log
$brainzPid = [int](Get-Content output/imports/2026-10-17/musicbrainz-fetch.pid)
Get-Process -Id $brainzPid -ErrorAction SilentlyContinue
```

Logs and PID are local artifacts. A completed recording-fetch pass still does not mean database import or acoustic enrichment is complete. Resume with the same fetch command after a stopped worker has been checked. `progress.json` distinguishes running, limited, complete, incomplete and interrupted. Successful responses remain reusable if an external outage interrupts the run.

## Compile and validate an isolated import

```powershell
npm run brainz:import -- compile --prepared output/imports/2026-10-17/prepared --cache output/imports/2026-10-17/musicbrainz --output output/imports/2026-10-17/validation-snapshot-1
node --env-file=.env.migration scripts/importListeningHistory.js load-isolated --snapshot output/imports/2026-10-17/validation-snapshot-1 --replace-existing
# Repeat without replacement to verify idempotence:
node --env-file=.env.migration scripts/importListeningHistory.js load-isolated --snapshot output/imports/2026-10-17/validation-snapshot-1
```

The compile destination must be empty; the example snapshot already exists and uses the historical 1.1 ontology. With current 1.2 code, recompile into a new directory before loading. Do not run the historical load commands unchanged. Use a new directory for a later collection checkpoint. Compilation records retrieved, pending, missing and failed lookups separately. It preserves mapped recording placeholders and unresolved listens; related embedded entities are explicitly marked as incomplete. Redirects retain the original provider mapping and add a typed `RedirectsTo` assertion.

`load-isolated` rejects the main development host and arbitrary targets before connecting. Allowed targets are the existing `ep-flat-glitter-au4xn3l9` Neon validation endpoint (pooled or direct, database `musicmesh`, TLS `verify-full`) and the local restore database at `127.0.0.1:55433/musicmesh_restore`. The local restore service was unavailable during this run; Neon validation was explicitly selected. Cached clients reject a changed connection target. `--replace-existing` deletes relationships, entities and import-batch receipts in that isolated database. Use the separate `load-main` entry point for the shared backend.

All objects and hashes are validated before writes. Batches are atomic and use the shared advisory write lock. Without `--previous-snapshot`, existing records must match exactly. With an explicit loaded baseline, changed records use the checked refresh described above. Stored endpoint classes and referenced parent identities are revalidated for relationships. Interrupted imports can replay the same snapshot; a refreshed snapshot can supply `--previous-snapshot` to update unchanged imported records while preserving unrelated work and omitted evidence.

First snapshot (21:50 UTC): 60,449 entities and 63,295 relationships, including 21,415 ListeningEvents, 21,415 IdentityMappings, 9,119 Recordings, 3,862 Artists, 585 ArtistCredits, 1,912 Works and 2,141 URLs. There were 2,336 retrieved recording lookups, 5,953 pending, 13 redirects and zero request errors/missing responses. Additional Recording nodes are linked context and redirect targets, not extra listened recordings. All 967 unresolved plays remain preserved.

The isolated load completed; replay at 21:59 UTC verified all objects and created **zero** nodes or relationships. Evidence stays private under `output/imports/2026-10-17/validation-snapshot-1/isolated-import-receipt.json`, `validation-replay.log` and `validation-read-verification.json`. These counts are a fixed snapshot, not live collection progress.

Domain integration tests:

```powershell
$env:MUSICMESH_TEST_BRAINZ='isolated'
node --env-file=.env.migration --test tests/brainzPostgres.test.js
Remove-Item Env:MUSICMESH_TEST_BRAINZ
```

The public graph projection excludes private classes from search, degree counts, detail, schema discovery and traversal (including private bridges). Private and absent node detail requests return the same 404. Same-title recordings and parallel provider assertions retain their IDs. This is projection protection, not a new authenticated personal-history API.

## Validation

Latest refresh validation: 66 default tests passed, 11 database-dependent tests skipped; all five targeted Brainz repository/privacy tests passed against explicit Neon validation. The tests cover entity and relationship refresh, replay, user-correction rejection and failed-endpoint rollback. Build and Azure bundle loading passed with existing warnings. See the running progress report for actual main import receipts and workbench verification.

Sources: [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API), [rate limits](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting), [ListenBrainz export](https://listenbrainz.readthedocs.io/en/latest/users/api/export.html), [CSV parser](https://csv.js.org/parse/api/sync/).

## AcousticBrainz coverage pass

```powershell
npm run brainz:import -- acoustic-coverage --prepared output/imports/2026-10-17/prepared --cache output/imports/2026-10-17/acousticbrainz
Get-Content output/imports/2026-10-17/acousticbrainz/progress.json
```

This read-only pass checks the 8,289 exact recording IDs mapped from the personal history in batches of 25. It reuses the checksum-verified provider cache and 1.1-second minimum request spacing; exhausted quota headers defer the next request. It runs independently of the existing MusicBrainz worker against a different service, with its own lock and cache. Do not start another AcousticBrainz worker against the same cache.

The [provider API](https://acousticbrainz.readthedocs.io/api.html) omits absent recordings from successful count responses. Only a validated successful response establishes zero available submissions. Failed requests remain unknown. Successful cached batches replay without network calls; failed batches retry. Three consecutive failed batches stop the pass. An endpoint-wide 404 is a failed coverage request, not evidence that every recording is absent; unlike exact MusicBrainz lookups, AcousticBrainz 404 responses are retried on resumption.

`coverage.json` contains per-recording submission counts and evidence references. `progress.json` reports available/missing/unknown recordings, total submissions, distinct-recording coverage and play-weighted coverage. The 967 unmapped plays remain in the all-play denominator. Coverage during collection is a lower bound; unknowns are reported separately. Count coverage means an analysis is listed, not that its features are usable, compatible, or correctly attributed. No feature documents, similarities or database records are created by this command. Exact mapped IDs are checked independently; MusicBrainz redirects are not silently assumed to transfer AcousticBrainz coverage.

For the full pass, inspect `acousticbrainz-fetch.log`, `acousticbrainz-fetch.error.log` and `acousticbrainz-fetch.pid` under the same run directory. A limited 25-recording diagnostic found 20 with data before the full worker was started; it is not a representative coverage estimate.


## Explainable acoustic comparisons

```powershell
npm run brainz:import -- acoustic-compare --features output/imports/2026-10-17/acoustic-features --output output/imports/2026-10-17/acoustic-comparisons-pilot-v2 --neighbors 3
npm run brainz:import -- compile --prepared output/imports/2026-10-17/prepared --cache output/imports/2026-10-17/musicbrainz --acoustic output/imports/2026-10-17/acoustic-comparisons-pilot-v2 --output output/imports/2026-10-17/validation-snapshot-3
node --env-file=.env.migration scripts/importListeningHistory.js load-isolated --snapshot output/imports/2026-10-17/validation-snapshot-3 --replace-existing
```

These example output directories already exist: use fresh directories for another checkpoint. `acoustic-compare` consumes the completed feature manifest, not the running worker's in-memory results. During a full run, `progress.json` may describe more analyses than the last completed manifest. Inspect `featureCollectionState` in the comparison receipt: this pilot is `limited`, not full coverage.

Comparisons use separate rhythm and timbre families, exact extractor/audio compatibility cohorts, population z-score normalization and RMS Euclidean distance. Units are checked; missing values are never filled. Constant dimensions are excluded; fewer than three compatible recordings yields no comparison. Multiple submissions for a recording require an explicit selection before comparison. `--neighbors` accepts 1 through 10 (default 3); it limits each recording's selections, not the final undirected degree. A pair selected by either endpoint appears once.

The output stores checksummed `analyses.ndjson`, `comparisons.ndjson`, `cohorts.json` and `exclusions.json`. Cohort files contain normalization statistics and selected dimensions. Pair objects contain supporting analysis IDs and per-feature differences. Cohort membership and measurements determine cohort identity; changing the population changes scores and assessment IDs. Never compare distances across different cohorts as a universal similarity scale.

Optional `compile --acoustic` validates source-history identity, hashes, classes and endpoints before adding AnalysisOf, ComparesRecording and SupportedByAnalysis relationships. No additional listens are submitted. The default anonymous graph still hides ListeningEvent and IdentityMapping. Selected public analysis/comparison evidence is available to chat through the bounded catalog projection.

The isolated snapshot has 68,264 entities and 88,481 relationships, including 25 analyses and 51 comparisons. Main development now holds the larger snapshot documented above. Full feature collection and comparison generation are now complete; main refresh status is recorded in the progress report.


## Selected releases and directly linked catalog

```powershell
node scripts/importListeningHistory.js fetch-catalog --prepared output/imports/2026-10-17/prepared --cache output/imports/2026-10-17/musicbrainz --wait-for-lock
Get-Content output/imports/2026-10-17/musicbrainz/catalog-progress.json
Get-Content output/imports/2026-10-17/catalog-fetch-v2.error.log
# Once the catalog pass has finished, compile into a fresh directory:
node scripts/importListeningHistory.js compile --prepared output/imports/2026-10-17/prepared --cache output/imports/2026-10-17/musicbrainz --include-catalog --output output/imports/2026-10-17/catalog-snapshot-next
```

A worker is already queued: inspect `catalog-fetch.pid` and its live process before running another command. It waits for the original MusicBrainz recording lock. After handoff it retains serialized requests and at least 1.1-second spacing. Stale locks fail explicitly. `--limit N` creates a deliberately limited diagnostic manifest; repeating without the limit reuses cached successful responses and expands the full finite selection.

Selection and order: a second lookup for all 8,289 mapped recordings with every documented relationship category, then the 2,655 release IDs supplied in reconciled ListenBrainz mapping evidence, then direct recording artists/works and edition groups/billing artists, and finally one layer of referenced non-discography context. The full recording lookup also retains credits, genres, tags, ISRCs and annotation. Its payload supersedes the narrower first-pass Recording payload in a compiled graph; both raw response caches remain evidence. This adds 8,289 serial requests (at least about 2.5 hours at the configured spacing, plus response time/retries). Exact release lookups include ordered media/tracks and label entries. Artist lookups do not request full recording/release/work lists. Related outside recording/release/artist/work/genre targets remain embedded unless independently selected. A selected release is not a verified listening edition. Sibling tracks do not add plays.

The pass records requested/retrieved/missing/error results, all 13 requested relationship categories and explicit exclusions in version 2 of `musicbrainz/catalog-manifest.json`. Version-1 closure manifests need recollection; successful matching request URLs are still reusable. `catalog-progress.json` is live; a prior completed manifest may lag it. Compilation with `--include-catalog` verifies the source history, recording seed status/content hashes, and every successful catalog response. Changed seed evidence requires recollection. A snapshot retains catalog completeness and full-recording-relationship counts separately from the first recording pass and acoustic coverage. Unknown or failed requests are not evidence of absence.

These are exact lookups, so there is no capped list to paginate. Release track counts are checked; incomplete tracklists fail rather than silently dropping tracks. Future entity browsing must follow [MusicBrainz pagination](https://musicbrainz.org/doc/MusicBrainz_API#Paging), including variable-sized release pages. Native area fields are preserved in raw provider payloads and typed context nodes; they are not converted into guessed relationship UUIDs.

Timed-out AcousticBrainz batches now split into smaller serial requests (down to one recording if needed). Cached successful parent/child requests replay; HTTP failures are not automatically split, and three consecutive failed yielded responses stop collection. This is bounded retry recovery, not a guarantee that the service will complete. The first resumed pass recovered 150 timeout-affected analyses; the current full run remains in progress.


The queued worker was restarted with the expanded pass; read `catalog-fetch.pid` (PID 63456 at 23:32 UTC), `catalog-fetch-v2.log` and `.error.log`. The original recording and acoustic workers were left running. The original recording lookup still only includes artist/work/recording/URL relationships; the expanded pass fills the remaining categories after acquiring the shared lock. Its first live request and release/workbench checks are still pending at this checkpoint. Fixture checks alone do not establish provider compatibility or display.

## Read-only snapshot audit

```powershell
node scripts/importListeningHistory.js audit-snapshot --prepared output/imports/2026-10-17/prepared --snapshot output/imports/2026-10-17/validation-snapshot-4
```

This verifies graph checksums/classes/endpoints, actual class counts, exact source-event and mapping preservation, mapping relationships, and reconciliation of mapped recording IDs. It reports collection completion separately from database verification, with missing/error counts retained. Integrity mismatches fail; a valid partial snapshot returns a report with `collectionComplete: false` and named pending phases. The command itself is read-only. A true collection flag does not establish database capacity, successful import, workbench behavior or permission to skip those checks. File sizes are serialized payload sizes, not a PostgreSQL storage estimate.

The read-only snapshot-4 audit at 23:29 UTC verified all 21,415 source events, 20,448 mapped events and 967 unresolved events against the prepared source. This offline snapshot contains 74,001 entities/108,362 relationships, 7,161 first-pass recording lookups and the older 25-analysis acoustic pilot. It has not been loaded into either database. Evidence: `output/imports/2026-10-17/snapshot-4-audit.json`; isolated storage remains snapshot 3.

## Full acoustic enrichment refresh

The completed collection produced 7,220 analyses and 31,306 comparison candidates in 68 exact extractor/audio cohorts. Twenty-one exclusions affect 12 analyses: 18 family-specific small-cohort exclusions and three analyses missing required audio context. Coverage remains 7,220/8,289 matched recordings (87.10%) and 17,766/21,415 source plays (82.96%). Each selected submission is evidence about that analyzed file, not proof of the exact audio heard.

```powershell
node scripts/importListeningHistory.js acoustic-compare --features output/imports/2026-10-17/acoustic-features --output output/imports/2026-10-17/acoustic-comparisons-full-1 --neighbors 3
node scripts/importListeningHistory.js compile --prepared output/imports/2026-10-17/prepared --cache output/imports/2026-10-17/musicbrainz --acoustic output/imports/2026-10-17/acoustic-comparisons-full-1 --output output/imports/2026-10-17/main-development-snapshot-2
node --env-file=.env scripts/importListeningHistory.js load-main --prepared output/imports/2026-10-17/prepared --snapshot output/imports/2026-10-17/main-development-snapshot-2 --previous-snapshot output/imports/2026-10-17/main-development-snapshot-1
```

The output directories already exist; compilation/comparison require fresh directories for future runs. Replaying the load command is safe if stored records still match the expected states. Twenty-five overlapping analyses differ only in explanatory `selectionLimitation` text. Measurements and source hashes are unchanged. The 51 pilot comparisons and 204 supporting relationships remain as historical evidence with their original cohort IDs/sizes; their distances must not be combined with the full-cohort distances. The new snapshot itself has 115,229 entities and 251,076 relationships; the database also retains the pilot and any unrelated work. Expanded MusicBrainz releases/relationships are not included until the catalog pass has a finalized manifest.

Snapshot 2 loaded successfully at 03:11:03 UTC on 18 October. Actual database totals, including historical pilot evidence, are 115,280 entities and 251,280 relationships. Its receipt records 38,501 newly created entities, 132,419 newly created relationships and 25 updated analysis descriptions. Direct PostgreSQL/API checks and actual workbench explanation passed. A targeted replay of the 25 refreshed analyses plus one new comparison produced zero writes. For the next enrichment, compile a fresh snapshot and pass snapshot 2 as `--previous-snapshot`. If a stored correction conflicts, investigate it; do not reset the database to bypass the conflict.
