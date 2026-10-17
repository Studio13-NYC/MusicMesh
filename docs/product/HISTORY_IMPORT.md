# Personal history preparation and retrieval

Current checkpoint: 17 October 2026. Preparation and collection write local artifacts. `compile` creates a validated graph snapshot; `load-isolated` writes only an explicitly selected validation database. No command resubmits plays to ListenBrainz. Typed chat integration is implemented and verified on Neon validation. A limited acoustic comparison pilot is also validated. The linked catalog collector is queued; live release import, production replacement and full acoustic collection remain pending phases of the [plan](../plans/2026-10-17-brainz.md).

## Acoustic feature collection

Coverage completed: 7,220 available recordings, 1,069 absent, zero unknown; available recordings cover 17,766 plays. The feature pass selects the earliest submission (offset 0) for each available recording. This is a baseline sample of audio analyses, not a verified match to the audio file actually scrobbled or an average of duplicate submissions. Full provider documents remain in the ignored local cache; compact entities omit submitted filename tags and preserve extractor version, units, offset, content hash and count of available submissions. Missing features stay absent. Incompatible/malformed documents are reported as unsupported rather than invented.

```powershell
node scripts/importListeningHistory.js acoustic-features --prepared output/imports/2026-10-17/prepared --coverage output/imports/2026-10-17/acousticbrainz --cache output/imports/2026-10-17/acoustic-features
Get-Content output/imports/2026-10-17/acoustic-features/progress.json
Get-Content output/imports/2026-10-17/acoustic-features-resume-2.error.log
```

The original feature worker (PID 53132) stopped after timeouts. The current resumed worker was started as PID 46252; check the PID file and process before resuming. Do not run a second AcousticBrainz worker while it is active. The completed count worker is no longer needed. A stale lock may only be removed after verifying its PID is no longer alive. Repeating the command revalidates count evidence and cached responses. `--limit 25` produces a deliberately limited pilot. The final `manifest.json` hashes `analyses.ndjson`; `progress.json` distinguishes running/interrupted/limited/complete. Collection does not write the database, calculate similarity or make all 391,369 submissions part of the first pass. [Official bulk API and offset semantics](https://acousticbrainz.readthedocs.io/api.html).

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

`load-isolated` rejects the production host and arbitrary targets before connecting. Allowed targets are the existing `ep-flat-glitter-au4xn3l9` Neon validation endpoint (pooled or direct, database `musicmesh`, TLS `verify-full`) and the local restore database at `127.0.0.1:55433/musicmesh_restore`. The local restore service was unavailable during this run; Neon validation was explicitly selected. Cached clients reject a changed connection target. `--replace-existing` deletes relationships, entities and import-batch receipts in that isolated database. It is not a production cutover command.

All objects and hashes are validated before writes. Batches are atomic and use the shared advisory write lock. Existing records must match exactly: conflicting data is rejected rather than overwritten. Stored endpoint classes and referenced parent identities are revalidated for relationships. Interrupted imports can replay the same snapshot; a refreshed snapshot with changed metadata requires explicit replacement of this disposable validation dataset. This is not yet a general incremental enrichment updater.

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

Latest comparison checkpoint: 52 default tests passed, eight database-dependent tests skipped; all 12 targeted Brainz/chat integration tests passed against explicit Neon validation. Build and Azure bundle loading passed with existing warnings. Actual workbench explanation and before/after database counts were verified. No production history replacement has occurred. See the running progress report for fixed snapshot counts and receipts.

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

The current isolated snapshot has 68,264 entities and 88,481 relationships, including 25 analyses and 51 comparisons. Earlier pilot/snapshot files are historical local checkpoints, not production data. Collection still needs to finish, retry recorded failures, and generate a full comparison snapshot before production activation.


## Selected releases and directly linked catalog

```powershell
node scripts/importListeningHistory.js fetch-catalog --prepared output/imports/2026-10-17/prepared --cache output/imports/2026-10-17/musicbrainz --wait-for-lock
Get-Content output/imports/2026-10-17/musicbrainz/catalog-progress.json
Get-Content output/imports/2026-10-17/catalog-fetch.error.log
# Once the catalog pass has finished, compile into a fresh directory:
node scripts/importListeningHistory.js compile --prepared output/imports/2026-10-17/prepared --cache output/imports/2026-10-17/musicbrainz --include-catalog --output output/imports/2026-10-17/catalog-snapshot-next
```

A worker is already queued: inspect `catalog-fetch.pid` and its live process before running another command. It waits for the original MusicBrainz recording lock. After handoff it retains serialized requests and at least 1.1-second spacing. Stale locks fail explicitly. `--limit N` creates a deliberately limited diagnostic manifest; repeating without the limit reuses cached successful responses and expands the full finite selection.

Selection: 2,655 release IDs supplied in reconciled ListenBrainz mapping evidence; artists and works directly attached to listened recordings; release groups/billing artists from those editions; one layer of referenced non-discography context. Exact release lookups include ordered media/tracks and label entries. Artist lookups do not request full recording/release/work lists. Related outside artists/works remain embedded context. A selected release is not a verified listening edition. Sibling tracks do not add plays.

The pass records requested/retrieved/missing/error results and explicit excluded categories in `musicbrainz/catalog-manifest.json`. `catalog-progress.json` is live; a prior completed manifest may lag it. Compilation with `--include-catalog` verifies the source history, recording seed status/content hashes, and every successful catalog response. Changed seed evidence requires recollection. A snapshot retains catalog completeness separately from recording and acoustic coverage. Unknown or failed requests are not evidence of absence.

These are exact lookups, so there is no capped list to paginate. Release track counts are checked; incomplete tracklists fail rather than silently dropping tracks. Future entity browsing must follow [MusicBrainz pagination](https://musicbrainz.org/doc/MusicBrainz_API#Paging), including variable-sized release pages. Native area fields are preserved in raw provider payloads and typed context nodes; they are not converted into guessed relationship UUIDs.

Timed-out AcousticBrainz batches now split into smaller serial requests (down to one recording if needed). Cached successful parent/child requests replay; HTTP failures are not automatically split, and three consecutive failed yielded responses stop collection. This is bounded retry recovery, not a guarantee that the service will complete. The first resumed pass recovered 150 timeout-affected analyses; the current full run remains in progress.


Remaining boundary: the original recording lookup includes artist/work/recording/URL relationships. The queued closure does not retroactively fetch recording-place/event/instrument categories. Those categories need a further request/audit before claiming exhaustive recording metadata. Live release response compatibility and display are also pending; fixture checks alone do not establish them.
