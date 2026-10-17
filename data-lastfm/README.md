# Last.fm history imported into ListenBrainz

Source account: `bobdobbsnyc` (Last.fm).
Destination account: `nickknyc` (ListenBrainz).

The source CSV contains 21,415 unique timestamp/artist/track combinations,
from 2016-08-17 19:36:52 UTC through 2026-10-15 17:18:26 UTC.
The Last.fm profile also displayed 21,415 scrobbles during verification.

The import uses the official `POST https://api.listenbrainz.org/1/submit-listens`
endpoint with `listen_type: import`, batches of at most 1,000, and at least
1.1 seconds between requests. It preserves timestamps, artists, tracks and albums.
Source MusicBrainz IDs are preserved under `lastfm_*` metadata fields rather than
guessing their entity type; ListenBrainz resolves its own canonical mappings.

Files:

- `recenttracks-bobdobbsnyc-1792084706.csv`: untouched source.
- `listenbrainz-listens.json`: converted submission records.
- `listenbrainz-import-receipt.json`: acknowledged batches, current verified
  count, three timestamp/name sample checks, and completion flag.
- `import_listenbrainz.py`: standard-library Python converter/importer/verifier.

Run from `D:\Studio13\Lab\Code\MusicMesh`:

```powershell
# Prepare records without submitting anything:
python data-lastfm/import_listenbrainz.py

# Recheck the public count and samples without an API token or new submissions:
python data-lastfm/import_listenbrainz.py --verify
```

The script's `--submit` option reads the existing ListenBrainz user token from
stdin. The completed operation obtained it from the signed-in Settings page,
passed it in memory to the importer, and did not store it. Never place tokens in
command arguments, logs, source files or Git. The script validates the token's
account before submitting. Preserve the receipt: it prevents resubmission of
acknowledged batches and stops if an interrupted batch needs reconciliation.

Public API examples:

```text
https://api.listenbrainz.org/1/user/nickknyc/listen-count
https://api.listenbrainz.org/1/user/nickknyc/listens?count=25
https://api.listenbrainz.org/1/user/nickknyc/listens?max_ts=1471462613&count=1
```

For a full future history download, use the authenticated export API rather than
paginating through the entire listens endpoint. Keep API clients to one request
per second and respect rate-limit headers.

Known limitations: ListenBrainz's source caches total listen counts for five
minutes. Imported historical statistics can take up to two weeks to appear;
historical plays and computed statistics are separate stages. The Last.fm
automatic connection remains enabled. No MusicMesh application runtime,
production database configuration or unrelated files were changed.

References:

- https://listenbrainz.readthedocs.io/en/latest/users/api/core.html
- https://listenbrainz.readthedocs.io/en/latest/users/json.html
- https://listenbrainz.readthedocs.io/en/latest/users/api/export.html
- https://listenbrainz.readthedocs.io/en/latest/general/data-update-intervals.html
- https://github.com/metabrainz/listenbrainz-server/blob/master/listenbrainz/listenstore/timescale_listenstore.py
