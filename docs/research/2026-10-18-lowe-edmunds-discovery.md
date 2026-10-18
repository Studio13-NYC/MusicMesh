# Lowe-Edmunds discovery: saved graph expansion

18 October 2026. Completed bounded research, separate from background catalog collection.

## Discovery policy

Listening history guides exploration; it does not limit what enters the database. Add useful connected artists, albums, recordings and musical factors even without corresponding plays. Establish artist associations before album/session/recording research. Plays remain distinct from explicit likes. Continue one approved avenue at a time.

Persist sourced tentative claims with confidence and scope. Album participation is not an automatic credit on every track. Original studio credits do not describe live/demo performances. These rules apply to familiar music and new discoveries alike.

## Findings

- Rockpile connects Nick Lowe, Dave Edmunds, Billy Bremner and Terry Williams. Lowe describes *Labour of Lust* and *Repeat When Necessary* as Rockpile collaborations issued under individual names. He also explains *Juppanese*: Lowe produced one half with Rockpile backing; Gary Brooker handled the other. [Firsthand label interview](https://www.yeproc.com/?p=1638).
- *Party of One* connects Edmunds's production/guitar work to Ry Cooder, Jim Keltner, Bill Kirchen and Austin DeLone. Its notes trace part of that ensemble to John Hiatt's *Bring the Family*. These are album-level personnel statements. [Official album notes](https://nicklowe.bandcamp.com/album/party-of-one).
- Edmunds recalls piano, acoustic guitar and six-string bass on “All Men Are Liars.” The saved performer claim is restricted to the original studio recording and verified edition; makes/models remain unknown. [Edmunds interview](https://ultimateclassicrock.com/dave-edmunds-interview-2015/).
- The label identifies *Tracks on Wax 4* and *Seconds of Pleasure* within Rockpile's recorded work. Bonus duets require separate personnel scope. [Yep Roc release notes](https://www.yeproc.com/rockpiles-seconds-of-pleasure-reissue-announcement-available-on-yellow-color-vinyl-out-june-7/).

## Saved and verified

Main received **145 new entities and 249 relationships**: 113 catalog entities / 201 catalog relationships, plus 16 EvidenceAssertions, 16 SourceDocuments and 48 assertion links. Existing records were reused without overwriting. Five new provider lookups supplemented checksum-verified local cache responses. Selected editions retain full track structures, including unplayed music. Rockpile and Little Village memberships use the existing provider adapter.

Research scores are 90 or 95; provider metadata retains provenance without invented numeric confidence. Fifteen claims are non-inheriting album credits; one is edition-scoped direct recording evidence. Juppanese's side limitation remains in the summary and confidence reason; there is no dedicated album-side scope.

The user's direct instruction authorized the operator run; no app modal click was fabricated. Existing `persistDecision` validation and domain repository methods ran inside one advisory-locked Prisma transaction with a hash-keyed ImportBatch receipt. Replays check that receipt. Large evidence was prepared, uploaded, account/access checked and compacted through the existing private Azure archive; 79,395 new compressed bytes were uploaded.

Private run directory: `output/research/2026-10-18-lowe-edmunds/`.

- `catalog-extension/`: exact source objects, checksums and response manifest.
- `claims.json`, `source-texts.json`, `sources/`: claims and retrieved sources.
- `main-persistence-receipt.json`: target, authorization, counts and claim IDs.
- `main-readback.json`: independent ID-bounded verification of 113 catalog nodes, 201 catalog relationships and all 16 revision-1 claims.
- `evidence-archive/`: manifest and verified upload receipt.
- `local-context.json`, `expanded-history-context.json`: private history context, not eligibility filters.
- `graph-preview.html`: conversation graph preview.

The deployed Edge workbench loaded Juppanese, selected its ReleaseGroup, displayed **29 nodes / 47 edges**, and exposed both new AssertionSubject connections. The conversation graph exposes readable scope, confidence, sources and history context.

Receipt-guarded operator replay:

```powershell
node --env-file=.env output/research/2026-10-18-lowe-edmunds/persist.cjs
```

Do not rerun preparation to redefine a committed batch. Later assessments use the confidence-revision workflow.

## Required before the next bulk import

This extension is **outside main-development-snapshot-3**. Incorporate its exact saved baseline objects into the next compare-and-swap plan. Otherwise the importer may correctly reject differences in hydration, retrieval metadata or accumulated observations for provider IDs it assumes are new. Reconcile from saved source objects, archive receipt and ImportBatch record; preserve later user edits and local research claims. Do not delete records or overwrite blindly.

This step does not complete the final collector import, implement song families, infer preferences, or import entire artist discographies.

## Proposed next branches

1. Mickey Jupp: the two production teams and songs shared with Lowe/Edmunds.
2. Cooder, Keltner and Hiatt: their ensemble across the connected albums, including session methods and instruments.
3. Lowe/Edmunds vocal arrangements and the Everly Brothers material.
