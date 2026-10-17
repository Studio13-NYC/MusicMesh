# Personal history preparation and retrieval

Current checkpoint: 17 October 2026. These commands prepare local files and fetch public metadata. They do **not** write PostgreSQL or resubmit plays to ListenBrainz. Database replacement, graph-writer integration, linked release/work detail retrieval and AcousticBrainz analysis remain later phases of the [plan](../plans/2026-10-17-brainz.md).

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

## Validation

`npm test`: 29 passed, one existing database integration test skipped because no isolated test target was selected. `npm run build` passed with the existing large-chunk warning. Three real recording lookups returned validated HTTP 200 data before the full worker started. Repeated preparation verified all artifact hashes. No production database writes were performed in this checkpoint.

Sources: [MusicBrainz API](https://musicbrainz.org/doc/MusicBrainz_API), [rate limits](https://musicbrainz.org/doc/MusicBrainz_API/Rate_Limiting), [ListenBrainz export](https://listenbrainz.readthedocs.io/en/latest/users/api/export.html), [CSV parser](https://csv.js.org/parse/api/sync/).
