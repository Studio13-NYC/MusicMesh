# Artist-specific songs and purposeful traversal

18 October 2026. **Design proposal, not implemented.** Nick requested one visible song for all versions performed by the same artist, led by the original album version, with version additions and overrides. He explicitly selected: when a live/demo version lacks its own credits, retain the original recording's credits as context and leave that version's credits unknown.

The goal is to uncover meaningful connections among songs Nick likes: instruments and models, performers, producers, engineers, studios, techniques, genres and musical characteristics. Keep the existing OO domain classes, Prisma/PostgreSQL, private Azure evidence and chat/workbench. Sourced tentative claims remain persistable with confidence and revision history.

## Current code and gaps

- `src/domain/catalog.js` and `src/domain/index.js` distinguish Work, Recording, Track, Release and ReleaseGroup. There is no current artist-specific Song entity. The old `Song` label is classified as ambiguous legacy data; a new definition must not reactivate or reinterpret old rows.
- `src/import/catalogGraph.js` preserves provider identities, ordered artist billing and actual MusicBrainz relationship types. Work performances must be read from both applicable structural relationships and imported provider relationships, not assumed to all use `PerformanceOf`.
- `src/enrichment.js` resolves album all-tracks assertions and direct additions/exclusions/replacements. It has no song-family resolution or cross-version inheritance policy.
- `src/researchTools.js` offers compact graph search, adjacency summaries, filtered neighbors, edition tracklists, credits, factor comparisons and listening aggregates. Searches and comparisons operate on separate catalog objects. Neighbor order is stable ID order, not research value. Factor comparison is recording-based; it does not deduplicate artist-song families.
- `src/researchRunner.js` already chooses tools within a bounded task: eight model steps, sixteen tool calls and a 30,000-token hard stop, with earlier finalization. These are ceilings, not targets. There is no persistent album-by-album enrichment queue or version-aware research frontier.
- The collector targets listened recordings, selected editions and bounded context. It does not promise every original album or every variant. Missing lead versions require selective lookup, not another global catalog crawl.

## Recommended grouping

Add a typed MusicMesh `Song` representing **this performing artist's rendition of a composition across recorded versions**. The interface displays one song, with its original album recording selected initially. Retain existing Recording objects underneath it. Model the requested subclass behavior as version instances with explicit relationships and scoped inheritance; do not generate a programming-language class for each individual song or duplicate existing recordings into parallel version rows.

Proposed relationships:

| Relationship | Meaning |
| --- | --- |
| `SongByArtist`: Song -> Artist | Performing identity for this song family; preserve variant artist billing separately. |
| `SongWork`: Song -> Work | Composition connection when known; optional while unresolved. |
| `HasVersion`: Song -> Recording | A particular original, live, demo, alternate take, edit, remix or re-recording belongs to this family. Preserve multiple version descriptors where appropriate. |
| `CanonicalVersion`: Song -> Recording | One active preferred lead under Nick's original-album policy. Selection is revisable and must target a member. |
| `OriginalAlbum`: Song -> ReleaseGroup | Original album context, with a specific edition/track reference when established. |

Song IDs stay stable when membership or the lead changes. Artist/work IDs are lookup evidence, not an irreversible name-based identity. Membership, lead selection and individual music claims each have their own evidence, confidence, rationale and revision history. Uncertain family membership can be saved as a candidate and shown in the interface without deleting or merging recordings. Aggregate counts must disclose uncertain membership; unresolved candidates must not be counted in multiple families as established membership.

Different artists' covers remain separate Songs connected through Work. A band, its frontperson and a collaboration are not silently the same artist. Changed billing or guest credits can be considered using evidence about the performing identity; exact credited-name strings alone do not determine membership. Shared title, approximate duration or acoustic similarity can suggest candidates but cannot by themselves establish sameness. Medleys/multiple-work recordings need explicit handling rather than being collapsed into one of their component songs.

Alternative approaches considered: using Work alone would group different artists together; physically merging recordings would erase version-specific sessions and listening context. The Song layer adds the requested unified view while retaining the existing catalog underneath.

## Original album as lead

Prefer the artist's original album recording and original album context. An earlier single or demo does not displace it merely because its date is earlier. Preserve earliest known publication separately. For a song never issued on an original studio album, use its earliest supported official release as an explicit fallback; retain a provisional lead when the evidence is incomplete. Earlier regional editions and partial dates need not block grouping: choose the known album context and record uncertainty about the exact edition.

A cover's lead is that artist's original album rendition, not the first recording by another artist. The lead may be outside Nick's played editions: import just the necessary missing catalog objects when evidence identifies them. Never equate the earliest item in the current subset with the globally original release without qualification.

The canonical choice controls presentation and default comparison context. It never changes which recording a play or a version-specific preference describes. Keep the historical ListeningEvents and original mappings; any mapping correction is a separate recorded assertion.

## Effective relationships and inheritance

| Context | Effective behavior |
| --- | --- |
| Composition facts | Known work identity and applicable writing facts are available across the song family, retaining arrangement/translation exceptions. |
| Same recording on a compilation | Reuse the Recording and its recording/session facts; keep compilation publication, track position and mastering context separate. A compilation appearance is not inherently a new performance. |
| Remaster of the same recording | Keep recording/session facts; resolve mastering differences at the release/master context. A label saying remastered does not imply a new performance. |
| Original album | Research shared session/album evidence once; all-tracks assertions apply only to the stated original session/track set. Album-only credits remain album-only. Bonus tracks are not automatically included. |
| Live, demo, alternate take or re-recording | Keep shared song/work context. Original-version studio, producer, engineer, personnel, instrument/model and acoustics do not fill unknown version-specific fields. Display them as original-version context. |
| Remix or edit from a known source | Inherit only categories justified by documented derivation; new mixing, overdubs, removed parts and edition-specific mastering can alter applicability. Unknown derivation does not imply inherited production facts. |

Resolve effective facts at read time: applicable shared facts plus applicable album/session defaults plus direct version/edition additions, minus named exclusions or replacements. Retain both the original and the overriding evidence. An unverified assumption must never silently suppress a conflicting supported claim. Missing means unknown, not absent. Zero-confidence claims remain inspectable but do not apply positive credits or exceptions. Show direct/inherited/original-context/unknown/conflicting distinctions in compact results.

Genre/style can vary by recording; Roon album classifications stay attributed to the album and are displayed as album context unless broader applicability is supported. Acoustic measurements stay tied to the analyzed recording/submission. Song-level likes and version-level likes must be distinct; repeated plays prioritize investigation but do not create likes.

## Traversal strategy

Every song and album receives a compact coverage summary. Deep research is prioritized rather than run to a fixed depth for every item. An album is an efficient research unit; a Song is the default discovery and counting unit; a Recording remains the unit for performance/production evidence.

1. **Resolve the entry context.** From any compilation track, live track, album or search result, locate the Song, lead recording, selected/listened version and original album. Return existing useful facts immediately. Render the stored graph without waiting for enrichment or an LLM-created preview.
2. **Inspect coverage before choosing a direction.** Summarize available people/roles, studio/session, instrument/model, technique, genre, acoustic evidence and uncertainties. Distinguish unresearched, researched-with-no-result, tentative, supported and conflicting. Each missing value is a possible research task, not an instruction to browse everything.
3. **Research original albums once.** Reuse existing catalog/cache facts and retrieve album liner notes, session accounts or interviews for shared contributors and locations. Persist sourced tentative claims immediately under the approved scope. Then investigate specific track exceptions and genuinely different versions. Group compilation songs by original album/session before assigning work.
4. **Choose promising connections.** Prefer paths that could answer the actual question, connect distinct liked songs/artists, explain a version preference, or resolve a consequential uncertainty. Favor specific factors such as a named player plus Hammond organ, a studio plus engineer, or a documented technique. Broad Pop/Rock membership is useful orientation but weak discrimination. Low-confidence, high-impact leads can deserve research because verification would change the answer.
5. **Test the connection.** Follow a factor to a bounded set of other Songs, preserving the exact recordings and credit roles. Count independent songs and album/session contexts; a studio version, its compilation appearances and ten live variants are not twelve independent examples. Seek counterexamples, disliked/neutral examples when provided, and coverage gaps. Repeated metadata from one source remains one evidential origin.
6. **Return a useful next step.** Report what connects the songs, the supporting versions, confidence and gaps; propose a listening comparison or the next focused research question. Stop when the question is answered, the current request budget is reached or further evidence is unlikely to change the answer.

Before expanding a path, the agent should be able to state internally: what question this path tests; what useful result would change the answer; which source or stored relationship may supply it; and what would make it stop. Priority combines relevance, distinctiveness, evidence coverage, expected information gain and lookup cost. Start with explainable ordering rather than invented numerical utility scores.

For the first pilot, explore at most three promising factor paths per album pass, usually across two semantic connections (Song -> factor -> other Song). These are adaptive caps, not a requirement to traverse. Reserve broader searches for unresolved, high-value questions. Keep the existing bounded Luna/high application loop. Where operator-led parallel source research is useful, the previously requested Luna/Medium workers and Astra/High batch review receive separate album/session questions and compact results; this is not claimed to be a deployed multi-agent service.

Persist compact research checkpoints per album/song: last source/coverage revision, paths tried, useful unanswered questions, and why to revisit. New relevant evidence or a new user question can trigger another pass. No daily full-library/database rereads. Cache reusable sources; keep large bodies in private Azure Blob. A background batch mechanism would be new implementation, not something the current chat loop already provides.

## Listening and interface behavior

- Search/default graph: one Song card/node per artist-song, original album/lead shown, expandable version count. Selecting a version shows its own effective factors and differences from the lead.
- Song play totals sum distinct original ListeningEvent IDs once across mapped member recordings. Retain per-version and submitted-album breakdowns. Do not transfer compilation listens to an original album's actual play count; a separate original-album-attributed view must be labeled derived.
- Default cross-song comparisons count Song families once. Version comparisons remain an explicit view, especially for testing whether Nick prefers a production, performance or composition. Do not replace a preferred live recording with the canonical studio recording in playback or recommendations.
- A narrow cached query supplies the first useful view. Enrichment streams subsequent evidence and updates instead of blocking the graph. Identity or consequential scope choices use the existing Approve/Deny/Defer modal.

## Staged implementation and proof

1. Define Song and relationship classes, semantics and identity/lead rules. Update the legacy Song crosswalk without reviving historical rows. Add nullable/optional work and provisional membership support. Generic Prisma graph storage remains the intended path; validate whether any new indexed projection is needed before schema changes.
2. Build bounded family candidate resolution from the existing local provider cache. First use exact recording identity, explicit work performance and artist identity, then scoped source-backed candidates. Save a reviewable manifest; retain imported rows and IDs unchanged.
3. Add version-aware effective facts and distinct play/factor counts. Extend evidence subjects and preference scope explicitly where needed. Do not copy original studio credits to live recordings.
4. Add the collapsed Song view and targeted family/coverage/connection retrieval to the existing tools and UI. Add selective album checkpoints only with the batch enrichment implementation, not a second overlapping chat pipeline.
5. Pilot on the existing ten-album cohort, including compilation reuse, demo/studio, live/studio and cover distinctions. Verify original album leads, no lost/doubled plays, named overrides, confidence revisions, private history protection and actual SPA behavior. Then expand incrementally to the rest of the listened catalog, honoring the October Neon allowance and compact evidence storage.

Local feasibility check on 18 October: the existing 228-recording pilot cache contained 146 recordings with exactly one explicit performance Work, two with multiple Works and 80 without such a link. Exact full artist-credit IDs plus one Work yielded 142 candidate groups, four containing multiple recordings. This is a conservative candidate check, not complete grouping or validation of the mappings. Missing Works should lead to provisional families and targeted evidence, not prevent all progress. Private evidence: `output/roon-browse/song-family-probe.json`. No provider requests, database reads or writes were performed for that check.

Acceptance includes: same recording on several compilations stays one recording; different-artist covers stay separate Songs; live/demo credits remain unknown without evidence; original album leads survive earlier demos/singles; songs without an album have an explicit fallback; medleys do not overmerge; confidence/identity changes are reversible; original event counts remain unchanged; unrelated compilation material does not inherit the original album's credits; the first graph view is available before web research completes; resumed work skips unchanged sources and reports actual coverage.

## References

- [MusicBrainz Recording](https://musicbrainz.org/doc/Recording): recorded audio can appear on multiple tracks/releases.
- [MusicBrainz recording style](https://musicbrainz.org/doc/Style/Recording): separate performances/remixes versus mastering differences.
- [MusicBrainz works](https://musicbrainz.org/doc/How_to_Use_Works): composition identity across artists and recordings.
- [MusicBrainz release group style](https://musicbrainz.org/doc/Style/Release_Group): album-level type does not prove every track's type.
- [Current runtime](../product/CURRENT_STATE_AND_HANDOFF.md), [confidence policy](../product/CLAIM_CONFIDENCE.md), [evidence storage](../product/EVIDENCE_STORAGE.md), [October allowance](../product/OCTOBER_NEON_BUDGET.md).

This proposal changes MusicMesh presentation and derived semantics; it does not redefine MusicBrainz's provider identities. No grouping code, database mutation or new collection job is included in this design pass.
