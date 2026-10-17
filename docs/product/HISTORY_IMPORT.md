# Personal history preparation and retrieval

Current checkpoint: 17 October 2026. Preparation and collection write local artifacts. `compile` creates a validated graph snapshot; `load-isolated` writes only an explicitly selected validation database. No command resubmits plays to ListenBrainz. Production replacement, chat-writer integration, linked release/work detail retrieval and AcousticBrainz analysis remain later phases of the [plan](../plans/2026-10-17-brainz.md).

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

The compile destination must be empty; the example snapshot already exists. Use a new directory for a later collection checkpoint. Compilation records retrieved, pending, missing and failed lookups separately. It preserves mapped recording placeholders and unresolved listens; related embedded entities are explicitly marked as incomplete. Redirects retain the original provider mapping and add a typed `RedirectsTo` assertion.

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

Latest unit suite: 35 passed, four database-dependent tests skipped in the default run. The three Brainz database integration tests passed separately against the explicit Neon validation target. `npm run build` passed with the existing large-chunk warning. Three real recording lookups returned validated HTTP 200 data before the full worker started. Repeated preparation verified all artifact hashes. No production database writes were performed in this checkpoint.

Sources: [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API), [rate limits](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting), [ListenBrainz export](https://listenbrainz.readthedocs.io/en/latest/users/api/export.html), [CSV parser](https://csv.js.org/parse/api/sync/).
