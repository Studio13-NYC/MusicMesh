# Mickey Jupp: sessions, personnel and repertoire

18 October 2026. Completed after Nick approved the Mickey Jupp exploration. Listening history guides discovery but does not limit which artists, recordings or relationships are saved. This is a targeted addition to the shared development graph, separate from the running catalog collector and its final import.

## What the branch reveals

The original *Juppanese* LP has two production teams. Its seven-song side A has Nick Lowe producing, with Dave Edmunds and Billy Bremner on guitars, Lowe on bass and Terry Williams on drums. The five-song side B has Gary Brooker producing, with Chris Spedding on guitar, Bruce Lynch on bass and Dave Mattacks on drums; Brooker has a piano credit. These remain partial album credits, not universal defaults. [Discography transcription](https://www.mickeyjupp.se/lp.htm), [Lowe's firsthand account](https://www.yeproc.com/?p=1638).

Robert Ash and Pebble Beach Studio are credited at album level. The transcription's "Worthington" is normalized to the MusicBrainz studio identity in Worthing, with the discrepancy retained in the confidence rationale. The transcription also misspells Brooker and Mattacks; canonical identities were checked. No original sleeve scan was independently read in this run. The discography is fan-maintained, not represented as an official label database.

The catalog directly credits Brooker with organ on *The Ballad of Billy Bonney*, *Partir c'est mourir un peu* and *Brother Doctor, Sister Nurse*. Six assertions preserve the instrument type and performer for these three recordings at **75/100**. The organ's manufacturer, mechanism and model remain unknown. This is a useful lead for later comparison, not a Hammond identification. Sources: [Ballad](https://musicbrainz.org/recording/ac2b6144-d905-4a2d-a6b0-970ebf0b11c5), [Partir](https://musicbrainz.org/recording/a8e84732-0bd2-4e59-8c76-b23aa1819511), [Brother Doctor](https://musicbrainz.org/recording/641eccce-5b88-4eee-b394-d9c121213dc5).

One **65/100** assertion preserves MusicBrainz's Basing Street mixing-location claim on [Making Friends](https://musicbrainz.org/recording/686a5bd9-c738-48b8-859b-d99c2c9c39bd). It is recording-specific and explicitly about mixing. It is not presented as a verified original-album recording-studio credit. Provider relationships retain their own provenance independently of these research assessments.

Brooker's Procol Harum membership and Mattacks's Fairport Convention membership create artist-first routes beyond the album. Other directly supplied membership relationships were retained for bounded exploration, without fetching their discographies or copying their recording credits to Juppanese.

## Repertoire links and identity care

- **You'll Never Get Me Up in One of Those:** the Jupp recording and Edmunds's separately billed *Twangin…* recording point to the same [MusicBrainz work](https://musicbrainz.org/work/f382d28a-f47c-32cf-9c90-de8d94f94ea5), composed by Jupp. Their recording identities stay distinct. The [covers discography](https://www.mickeyjupp.se/covers.htm) also lists the Edmunds version.
- **Switchboard Susan:** Lowe's account connects it to the Jupp sessions and his subsequent *Labour of Lust* release. The inspected Lowe recording points to work `c0991f49-6081-356a-a06e-755776727d23`; the inspected Jupp recording points to `11492b2e-cb7c-4ea9-9151-22aba9a04d69`. Both name Jupp as composer. Both provider work IDs remain intact; a visual repertoire grouping does not merge database identities.
- The Jupp recording `a0d0ea0c-4588-4f6d-92f3-2333b499201b` has Godley/Creme production metadata. It must not be mislabeled as the rejected Lowe-session take or equated with the Lowe master. The original 12-track Juppanese program does not include Switchboard Susan.
- The initial **Ju Ju Man** lead was rejected: the inspected credits name Jim Ford and Lolly Vegas, not Jupp. No Jupp authorship link was created from that lead. [Provider credits](https://musicbrainz.org/release/4b420f46-685f-4dfb-b98d-b42ffea7dd29).

The saved Juppanese edition is the existing 2024 17-track reissue, `27646919-25ae-4123-8ef3-4d348f919434`. No claim declares it the original release. Original-LP evidence is limited to its 12 original titles; bonus recordings are excluded. No song-family merge or canonical-edition assignment occurred.

## What is actually saved

Main commit receipt at 2026-10-18T21:36:18Z:

| Item | Added |
| --- | ---: |
| Catalog/factor entities | 42 |
| Provider/structural relationships | 217 |
| EvidenceAssertions | 19 |
| SourceDocuments | 19 |
| Assertion links | 57 |
| **Total entities** | **80** |
| **Total relationships** | **274** |

The 19 claims comprise 12 non-inheriting album credits and seven direct recording claims. Scores are 65, 75, 85, 90 or 95, with explanations and initial revision histories. Missing numeric scores on provider relationships mean unassessed; they are not silently assigned 100.

The operator used existing domain constructors, the repository transaction writer and `persistDecision`. The actual user approval was retained; no app-modal event was fabricated. Existing provider rows were reused without overwriting them. Large provider values were compacted only after checksum-verified upload to the existing private Azure evidence container. Newly uploaded compressed content was **22,610 bytes**. No listening-event write, full Neon scan, full verification replay, billing change or new background collector was needed.

The first local pass encountered HTTP 503 while hydrating Pebble Beach's place record. Its explicit identity from the recording responses was sufficient for the scoped studio claim; the failed response is retained. Other required recording/work/artist lookups completed. This is not a claim that the background collection finished.

## Verification and reproduction

Private operator evidence is retained under `output/research/2026-10-18-mickey-jupp/`:

- `responses.json`, `repertoire-responses.json`, `provider-responses/`: exact provider source envelopes and hashes.
- `catalog-extension/{manifest.json,nodes.ndjson,relationships.ndjson}`: exact additive baseline, with source references.
- `claims.json`, `source-texts.json`: authorized claim packet and retrieved evidence.
- `evidence-archive/`: uploaded compact-evidence manifest and receipt.
- `main-persistence-receipt.json`, `main-readback.json`: transaction result and independent ID-bounded database readback.
- `surface-verification.json`, `graph-preview.html`: product and visualization checks.

From the repository root, the frozen batch is safely replayable:

```powershell
node --env-file=.env output/research/2026-10-18-mickey-jupp/persist.cjs
```

Verified replay returned `alreadyCommitted:true` using batch `operator-enrichment:8a704506261e457b5a7985819ead67afa0cb6d8e8beffbfdbadd50bee3b615f0`. Do not regenerate its preparation or claims files as a replay mechanism; they are the retained evidence for this committed batch.

Independent readback confirmed 42 catalog entities, 217 catalog relationships and all 19 confidence histories at revision 1. Loading Juppanese in the deployed Edge workbench showed a bounded **60-node / 90-edge** view with new artist, recording and evidence content; that capped view is not the total graph. The interactive discovery graph exposes 19 summary nodes and 25 connections; underlying versions and assertion paths are explained in its inspector. Desktop and narrow-layout checks found no node overlap or horizontal overflow, and no browser errors. Two Luna/Medium source researchers and an Astra/High reviewer supported the run; final integration and write verification were performed by the parent agent.

## Later catalog import and next step

This delta and the previous Lowe–Edmunds delta are outside `main-development-snapshot-3`. The next bulk compare-and-swap import must incorporate their exact provider baselines/receipts before attempting to hydrate or modify overlapping identities. Preserve local assertions and later edits. Do not delete or blindly overwrite rows to avoid conflicts, and do not claim snapshot 3 already includes these additions.

Recommended next approval: Brooker's artist network, starting with *No More Fear of Flying* and Procol Harum, to trace keyboard roles and recurring musicians. Alternatives are Mattacks's Fairport/session network or Jupp's songwriting route through Dr. Feelgood. Those deeper explorations are proposed, not completed in this batch.
