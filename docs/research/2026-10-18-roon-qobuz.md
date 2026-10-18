# Roon genres and Qobuz metadata for MusicMesh

Reviewed 18 October 2026 following Nick's suggestions. This is a source assessment and implementation follow-up, **not a connected integration or completed import**. Runtime status remains in [CURRENT_STATE_AND_HANDOFF.md](../product/CURRENT_STATE_AND_HANDOFF.md).

Priority update, 18 October: Nick deferred Qobuz while we evaluate what Roon supplies. Keep the Qobuz request unsent and do not pursue credentials or implement its adapter now. The optional [MusicMesh Browse extension](../../tools/roon-browse/README.md) is the next Roon access step; its local receipt, not this assessment, establishes whether user authorization has completed.

Live follow-up completed later on 18 October: Nick authorized the extension. Ten album-title/artist-text candidates from imported history all appeared in Roon genre lists (21 top-level genres and three Pop/Rock branches tested). All ten album detail lists and 24 genre membership lists were fully paged in 225 requests. All 21 root item keys changed on browse reset. Sampled album items exposed display text and navigation fields, not structured personnel roles or UPC/ISRC/MBIDs. These results support using Roon for attributed genre/library context, with edition matching still unresolved. Private album-level receipts and report are in `output/roon-browse/`. No graph import occurred. The source assessment below records the earlier evidence; live observations supersede its unverified capability questions only for these tested paths.

## Recommendation

Prioritize Roon as a candidate for Nick's genre hierarchy and library classifications, and Qobuz for complementary edition metadata, personnel text and supplementary documents. Keep MusicBrainz identities and existing domain classes as the foundation. Neither source establishes why Nick likes a recording.

Next: a read-only capability test against ten albums already in the listening catalog. Do not start another full catalog collection, install a second application stack, or delay the current MusicBrainz import for these optional sources.

## Roon: verified capabilities and limits

The official [browse service source](https://github.com/RoonLabs/node-roon-api-browse/blob/98adcbaba3a30fd6ce109c1f04cd361536143222/lib.js) explicitly documents `hierarchy: "genres"`, alongside albums, artists, composers and search. `browse()` navigates a server-side session; `load()` retrieves pages using offset/count. Items provide titles, optional subtitles, images and navigation keys. This is a list/navigation contract, not a documented bulk semantic graph export.

The contract does not establish that `item_key` values are permanent catalog identifiers. Do not use them as canonical MusicMesh identities without proving stability. Complete parent/child relationships, album assignments, external IDs and detailed credits are probe questions, not assumed capabilities.

Roon's [genre documentation](https://help.roonlabs.com/portal/en/kb/articles/genres) describes multiple classifications per album/artist and a hierarchy that users can rearrange. Users can change assignments and combine provider genres with file tags. An exported view may therefore represent Nick's customized library rather than an unmodified vendor taxonomy. Preserve that distinction; record origin as unknown when the API cannot separate those layers.

Roon's [track browser documentation](https://help.roonlabs.com/portal/en/kb/articles/tracks) says its track genre view uses **album genres**, not individual track genres. MusicMesh should expose those as inherited album classifications, not claim Roon supplied recording-specific judgments.

The [official Node API](https://github.com/RoonLabs/node-roon-api) discovers local Cores and requires the user to enable an extension requesting services. Prefer a small Node bridge on Prism **if Prism can reach the Core's network**. Azure cannot discover a home-network Core through local UDP discovery. Request only browse for the probe; do not select playback actions. Core location, connectivity and authorization remain unverified.

## QobuzApiSharp: useful metadata contracts

[QobuzApiSharp](https://github.com/DJDoubleD/QobuzApiSharp) is an unofficial C# client. Use its models and endpoints as references for a small adapter following our existing Node provider/evidence pattern. The library was not installed or tested against a live account.

Inspected commit: `c227398a6281a55365bb7425992de5d245b3de94`.

| Source model | Verified modeled fields | MusicMesh use |
| --- | --- | --- |
| [Album](https://github.com/DJDoubleD/QobuzApiSharp/blob/c227398a6281a55365bb7425992de5d245b3de94/QobuzApiSharp/Api/Models/Content/Album/Album.cs) | ID, UPC, title/version, artist/composer, label, dates, tracks, genre, genres_list, recording_information, description, goodies | Edition matching, album classification and leads for personnel/studio evidence |
| [Track](https://github.com/DJDoubleD/QobuzApiSharp/blob/c227398a6281a55365bb7425992de5d245b3de94/QobuzApiSharp/Api/Models/Content/Track/Track.cs) | ID, ISRC, title/version, duration, disc/track position, performer, performers, composer, work, album | Match track positions/recordings; retain track-specific credit text |
| [Genre](https://github.com/DJDoubleD/QobuzApiSharp/blob/c227398a6281a55365bb7425992de5d245b3de94/QobuzApiSharp/Api/Models/Content/General/Genre.cs) | ID, name, slug, numeric path | Provider vocabulary; validate path order/meaning before creating hierarchy edges |
| [Goody](https://github.com/DJDoubleD/QobuzApiSharp/blob/c227398a6281a55365bb7425992de5d245b3de94/QobuzApiSharp/Api/Models/Content/Album/Goody.cs) | ID, description, name, format, URL/original URL | Discover supplementary documents; inspect whether each is an accessible booklet |

Modeled fields do not prove coverage or current API behavior. `performers` and `recording_information` are strings, not normalized personnel tables. Preserve original text and source; extract explicit people/roles conservatively. They do not guarantee studio names or instrument makes/models. Booklets, liner notes and interviews remain important for those details.

The [album wrapper](https://github.com/DJDoubleD/QobuzApiSharp/blob/c227398a6281a55365bb7425992de5d245b3de94/QobuzApiSharp/Api/Service/Endpoints/QobuzApiService.Album.cs) supports paginated tracks; [track lookup](https://github.com/DJDoubleD/QobuzApiSharp/blob/c227398a6281a55365bb7425992de5d245b3de94/QobuzApiSharp/Api/Service/Endpoints/QobuzApiService.Track.cs) provides detail. Fetch albums first, then only missing relevant track information. Metadata work does not require audio/file URLs. The [favorites wrapper](https://github.com/DJDoubleD/QobuzApiSharp/blob/c227398a6281a55365bb7425992de5d245b3de94/QobuzApiSharp/Api/Service/Endpoints/QobuzApiService.Favorite.cs) offers a possible later user signal; a saved album does not establish that every song is liked.

The [README](https://github.com/DJDoubleD/QobuzApiSharp/blob/c227398a6281a55365bb7425992de5d245b3de94/README.md) distinguishes supplied application credentials from optional web-player credential discovery. Use granted credentials, consistent with [Qobuz's API terms](https://static.qobuz.com/apps/api/QobuzAPI-TermsofUse.pdf). This assessment did not execute credential discovery. Subscriber login alone does not establish application access. Some metadata wrapper calls default to no user authentication; user-specific operations have additional requirements. Verify approved access and endpoints before implementation.

## Proposed domain and evidence rules

These are adapter requirements, not newly shipped classes or relationships:

1. Reuse `Genre` with explicit provider/scheme identity. Never invent a MusicBrainz MBID for another provider's concept or merge equal names automatically. Add typed scheme/hierarchy semantics after proving the source structure; the current legacy `HAS_SUBGENRE` marker is not a validated import contract.
2. Keep vocabulary concepts, parent/child hierarchy and assignments separate. Preserve provider/local customization origin. Cross-provider equivalence requires a supported mapping.
3. Attach album classifications to the verified Release; use ReleaseGroup only when evidence supports scope across editions. Project album context onto that edition's tracks at query time, with direct additions/exclusions visible. Count each listen once per genre despite multiple supporting paths. Artist genres do not automatically classify all recordings.
4. Reuse `EvidenceAssertion`/`SourceDocument` and edition-aware scope resolution. Genre inheritance needs explicit semantics/tests before enabling it: do not relabel personnel `album-credit` claims as `all-tracks` to force inheritance. Track evidence remains narrow unless wider applicability is evidenced.
5. Match Qobuz IDs, UPC/ISRC, artist/title/version, duration and tracklist together. A catalog edition candidate is not proof of the edition Nick heard. Ambiguous matches use the existing Approve/Deny/Defer modal.
6. Keep compact typed facts in Prisma/Postgres and permitted original evidence in private Azure Blob. Roon authorization and private library evidence stay private. Cache responses and import changes incrementally; no daily full graph reads or duplicated evidence bodies.

Roon can support broad-to-specific genre exploration; Qobuz may add production/personnel factors. Report coverage, conflicting classifications, explicit preferences and counterexamples alongside common factors. Shared genre or producer remains a hypothesis about taste, not a causal finding.

## Bounded implementation follow-up

- **Roon:** authorize a browse-only extension on the Core's network. Inspect a genre root and a few branches; test paging, album membership, reconnect identity stability and availability of provider IDs/customization origin. Save a private capability receipt. Do not infer unavailable structure.
- **Qobuz:** establish approved application access. Query ten known album candidates and necessary track details. Measure populated genre/credit/document fields, validate genre paths and edition matches, and record missing or territory-dependent responses. No audio downloads.
- **Then:** implement only proven typed mappings through the existing importer. Test provenance, edition boundaries, inheritance and deduplication; expose actual source coverage to researcher tools. Load changed matched records through the existing Blob-backed incremental path.

No Core connection, connector installation, schema migration, database write, new collector or billing change occurred during this assessment. The runtime source registry still reports both integrations as unavailable.
