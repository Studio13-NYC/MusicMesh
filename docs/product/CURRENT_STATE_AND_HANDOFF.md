# MusicMesh current state and handoff

Updated 18 October 2026. The deployed site and root `.env` select the shared **development** instance, not production. Never use Alexander. Keep `STAY/` and original source files intact.

## Researcher runtime

The [approved specification](../superpowers/specs/2026-10-18-researcher-design.md) and [implementation plan](../superpowers/plans/2026-10-18-researcher.md) define the current change. Local code now uses a single GPT-6 Luna/high Responses API researcher. Discovery runtime and artist-context support are deployed (856010e / e425ab5). The approved Edmunds research is saved and independently verified; see the dated entries below.

- `src/researchRunner.js`: one model call per durable step, tool-directed exploration, bounded history/context/calls. No automatic model preview, planner, grounder or review chain.
- `src/researchTools.js`: compact catalog search/detail/adjacency/neighbors, edition tracklist, acoustic comparisons, private-history aggregates, semantics, evidence, sources, scoped credits and factor comparison.
- `src/researchStore.js`: Prisma ResearchRun state, lease/version retries, transactional Approve/Deny/Defer actions. State expires after 24 hours; new runs remove up to 100 expired records. Save decisions before expiry. No authentication boundary is claimed.
- `src/enrichment.js`: all-tracks album defaults versus album-only credits; direct track/recording additions and named exceptions. Edition membership is checked. Provider assertions remain unchanged.
- `src/publicSource.js`: bounded public HTTPS text retrieval, validated and pinned DNS, bounded redirects. Private networks, unsupported documents and oversized pages are rejected. Source text is untrusted evidence. Evidence can be an exact quote or a labeled summary tied to retrieved text or an explicit user-supplied source summary.
- `src/domain/`: typed SourceDocument/EvidenceAssertion fields and private PreferenceSignal; four explicit assertion/preference relationships. Generated DOMAIN_MODEL.md remains synchronized.
- Local and Azure APIs share `researchApi.js`: POST `/api/chat`, POST `/api/chat/decision`, GET `/api/chat/run?id=...`. The browser drives saved steps and renders retrieved graph IDs directly. Pending decisions appear in a Radix modal with exact subject/factor IDs, edition and overridden source claim; deferred runs have Resume and Cancel buttons. Expired in-flight leases require an explicit retry decision rather than silently repeating a potentially billed call.
- Default Nick / optional Guest attribution. Plays are not likes. Raw listening records remain excluded from graph tools; the single-owner development researcher can query listening aggregates.

## Verified data baseline

Shared backend: **182,221 entities, 368,477 relationships, 21,415 plays**, snapshot `main-development-snapshot-3`. Acoustic data includes 7,220 analyses and 31,357 comparisons including historical pilot comparisons. These counts describe the last verified backend receipt, not the ongoing collector.

Private provider evidence is in `samusicmesh/musicmeshevidence` in `rg-musicmesh`. The compact conversion was verified 18 October at 17:55:58 UTC, followed by compaction at 17:56:21. Main measured 702,447,616 bytes (669.91 MiB). Read [EVIDENCE_STORAGE.md](EVIDENCE_STORAGE.md) before import work. Future enrichment imports require a prepared/uploaded archive. No full database reread is needed for monitoring.

The expanded MusicBrainz collector continues independently; read `output/imports/2026-10-17/musicbrainz/catalog-progress.json` and the hourly state. Its `requested` is attempts so far, not a final total. Later downloaded data has not automatically been imported. Read [BRAINZ_PROGRESS.md](BRAINZ_PROGRESS.md) for receipts and chronology. Preserve the October-only allowance in [OCTOBER_NEON_BUDGET.md](OCTOBER_NEON_BUDGET.md).

## Commands and verification

```powershell
npm ci
npm run db:generate
npm run db:migrate
npm start
# Separate shell:
npm run dev
# Tests/build:
npm test
npm run build:api
npm run build
$env:MUSICMESH_TEST_DATABASE='isolated'
node --env-file=.env.restore --test tests/researchPostgres.test.js
```

Root `.env` is main. The local full restoration test database uses `.env.restore` and Docker container `musicmesh-evidence-validation` on 127.0.0.1:55433. Do not reset it. Existing UI/API processes may belong to other work; use a dedicated port for tests. `MUSICMESH_API_PORT=43102` with Vite `--port 3001` selects the test API proxy.

## Optional Roon operator extension

`tools/roon-browse/` now provides a separate local MusicMesh Browse extension with pinned SDK dependencies. Nick enabled it and a live ten-album capability test completed: all ten text-matched album candidates appeared in genre lists. Navigation keys proved unstable, and sampled album items did not expose structured credits or external IDs. Exact editions remain unverified. Current state/PID and private test receipts are in ignored `output/roon-browse/`. This is not an Azure/app connector or a database import. See [instructions](../../tools/roon-browse/README.md). Qobuz is deferred by Nick; retain the unsent request and evaluate Roon first.

## Current limits

- Genre arrays/tags exist in archived provider payloads but are not yet normalized into complete queryable genre assignments. The aggregate reports this coverage gap while returning real play totals.
- Factor comparison covers direct reviewed recording assertions plus imported MusicBrainz recording credits and instrument descriptors; use `credits` for edition-aware inherited factors. Imported provider release credits remain album-only unless separately evidenced as all-tracks.
- The researcher can prepare a missing typed factor (such as equipment model, studio or person) together with its scoped evidence. The modal explicitly shows the new identity; no model assertion becomes provider evidence.
- Roon local browse access is authorized and the ten-album capability test passed; the app/Azure researcher is not connected to that local bridge. Browse navigation keys are unstable and exact edition identity is unresolved. Qobuz is deferred and unconnected. Read the [Roon/Qobuz assessment](../research/2026-10-18-roon-qobuz.md) before implementing adapters. Public source search requires BRAVE_API_KEY; public HTTPS text reads and supplied excerpts work independently.
- No automatic claim of why Nick likes a song: explicit preferences and evidence coverage are separate from listening frequency and acoustic distance.
- No Neo4j runtime, exporter/importer, driver, credential setting or rollback workflow remains. Historical Git commits and protected archives are history, not instructions.

## Local performance evidence

`output/researcher-live-local.json`: greeting 1,150 total tokens / 1.86 seconds; selected release country 2,691 tokens / 2.78 seconds. These are two live API examples, not a general latency guarantee. The old country run used 56,935 tokens across answer/plan/preview/review. New simple answers invoke no automatic downstream model stages.

## Review and pre-deployment verification

Fresh review of `db96e68..4a53698` identified six important findings and no critical findings. Fixed track/recording context resolution, edition restrictions in comparisons/genre aggregates, ReleaseGroup default exceptions, approval scope display, uncertain-call retry handling and prompt/decision tape logging. Added cancellation. Regression tests were observed failing before fixes, then passing. `npm test`: 91 passed / 16 opt-in skipped. Isolated SQL suite: 16/16 passed. `npm run build` and `npm run build:api` passed; existing UI bundle size warning remains. Local workbench proved real 7-node/6-edge graph, Defer/Resume/Approve, and Deny without writes.

18 October 19:19 UTC: additive `20261018190000_research_runs` migration applied to MusicMesh main. Azure model settings set to `gpt-6-luna` / `high`. Application deployment proof still pending. No bulk catalog reads/imports were performed for this change.

## Deployed proof — 18 October

Commit `d941309` deployed successfully in [run 39158340330](https://github.com/Studio13-NYC/MusicMesh/actions/runs/39158340330). Actual Edge workbench request `req-e43d759b-9b07-4998-9b96-118d607dae2a` completed with seven stored nodes/six edges, four researcher calls, 8,875 total tokens and 13,139 ms summed model latency. Runtime telemetry confirms `gpt-6-luna` / high. Tape contains both the user prompt and final answer. Proof: `output/researcher-live-deployed.json`, `output/researcher-deployed-graph.jpg`.

Final usability pass: compact approval details keep Approve/Deny/Defer visible; user-supplied source quotations can carry through the bounded recent user history. Assistant assertions and selected-node text do not become source evidence. Current tests: 91 unit passes and 16 isolated SQL passes. Transcript appends use stable IDs and ordinary retry suppression, but are observational rather than a transactional outbox; a storage outage can leave a tape gap even though run state is saved.

## Completion — 18 October 19:31 UTC

Core runtime `740bafa` deployed successfully in [run 39158974520](https://github.com/Studio13-NYC/MusicMesh/actions/runs/39158974520). Build, unit tests and Azure bundle checks all passed in CI. Actual deployed Defer -> full page reload -> Resume -> Approve completed request `req-5e8bbd40-a7dc-434b-a89e-748042a7342f` with the chosen answer; tape independently contains prompt, defer, approve and answer. Local Deny and Cancel stopped test enrichment without saving it. No fabricated claims remain in the catalog.

Deployed country lookup `req-cd250054-e0ab-48e8-9d5e-e93617876693`: South Korea (KR), 2,820 tokens / 3,121 ms end-to-end. This is a representative lookup, not a latency guarantee. Final graph workbench check again showed seven stored nodes/six edges; screenshot `output/researcher-deployed-graph.jpg`. Proof files include `output/researcher-deployed-country.json`, `output/researcher-deployed-decision.json`, and `output/researcher-enrichment-modal.jpg`.

Temporary test API/Vite processes and the local restoration container have been stopped; its data remains intact. Existing user services and the MusicBrainz collector were left running. Remaining work is content enrichment/source coverage and optional provider access, not the replaced orchestration. This implementation does not claim every instrument model, studio or personnel credit is populated.

Final visual verification: `ad5d6ff` deployed successfully in [run 39159228539](https://github.com/Studio13-NYC/MusicMesh/actions/runs/39159228539). Retrieved neighborhoods now place their most-connected node centrally, with neighbors around it; the seven-node/six-edge workbench view was visibly verified and saved in `output/researcher-deployed-graph.jpg`. Unit tests and deployment build/API checks pass. GitHub contains the complete runtime and handoff; no source changes remain untracked.

## Bounded enrichment team pilot

The first operator-led research batch used two GPT-6 Luna/Medium source researchers and GPT-6 Astra/High review: 11 claims reviewed, 2 supported, 6 qualified, 3 lead-only. Private collated report and structured staging: `output/research/2026-10-18-enrichment-team/REPORT.md` and `reviewed-candidates.json`. That original review used a readiness gate now superseded by confidence-scored persistence. One sourced album claim has since been saved and reassessed through the workbench; the remaining batch is staged. This is not a deployed multi-agent service or completed batch import. The ordinary application researcher remains Luna/high. See [workflow and next steps](../research/2026-10-18-enrichment-team.md).

## Confidence-scored persistence - 18 October

Nick approved persisting sourced tentative claims with 0-100 confidence, rationale and revision history. See [CLAIM_CONFIDENCE.md](CLAIM_CONFIDENCE.md). The researcher can prepare/revise claims and retrieve assessment history on demand. Scores can rise, fall or stay unchanged; copied sources do not automatically raise them. Labeled source summaries are accepted, and no minimum confidence prevents saving. Existing typed identities, scope and Approve/Deny/Defer remain.

Local Edge workbench saved one real album producer claim to main at 85/100, then saved revision 2 at the same score using the same source as context. Targeted SQL independently confirmed both assessments and two source links. Private receipt/screenshot: `output/research/2026-10-18-enrichment-team/confidence-main-receipt.json` and `confidence-workbench.png`. Isolated database tests proved 35 -> 80 -> 15, stale revision rejection and idempotent approvals. This is separate from collector progress and final catalog import. No new bulk read or migration. Confidence runtime `5c3193e` deployed successfully in [run 39164990233](https://github.com/Studio13-NYC/MusicMesh/actions/runs/39164990233). Deployed Edge request `req-36da8a87-a097-4f1b-8aff-061152c99b7e` retrieved both assessments through claim_history and correctly explained same-source non-corroboration (4,062 total tokens). Private proof: `output/research/2026-10-18-enrichment-team/confidence-deployed-receipt.json` and `confidence-deployed.png`. CI: 97 passed, 17 opt-in skipped; targeted isolated PostgreSQL: 5 passed. GitHub code and shared development site are current.

## Song families and traversal proposal - 18 October

Nick requested one artist-specific Song spanning original, compilation, live, demo and alternate versions, led by the original album recording. He selected original-version context only for missing live/demo production credits; those versions remain unknown until evidenced. The reviewable strategy is `docs/research/2026-10-18-song-families-and-traversal.md`. It proposes typed Song grouping above existing Recording identities, scoped effective relationships, original-album research followed by high-value factor paths, and distinct song/event counts. This is a design proposal, not implemented grouping or a database import. The conservative offline 228-recording pilot found 146 single-Work recordings, two multiple-Work recordings and 80 without an explicit Work link; private evidence is `output/roon-browse/song-family-probe.json`. No new collector, Neon reads/writes or runtime changes.

## Discovery beyond listening history - 18 October

History guides research but does not restrict database eligibility. The completed expansion is documented in docs/research/2026-10-18-lowe-edmunds-discovery.md. Main gained 145 entities / 249 relationships, including 16 sourced confidence-scored claims; ID-bounded readback and the deployed Juppanese graph were verified. This addition is outside snapshot 3: integrate its exact source objects and receipt into the compare-and-swap baseline before the next bulk catalog import. Private receipts: output/research/2026-10-18-lowe-edmunds/.

### Mickey Jupp artist exploration - 18 October 2026

User-approved branch saved and independently checked: 80 entities / 274 relationships, including 19 confidence-scored claims. Juppanese's original LP sides retain distinct Lowe/Rockpile and Brooker/Spedding/Lynch/Mattacks credits. Three organ leads are 75/100; a recording-specific Basing Street mixing lead is 65/100. Jupp/Edmunds and Jupp/Lowe repertoire paths preserve separate recording and provider work identities. Shared main receipt: output/research/2026-10-18-mickey-jupp/main-persistence-receipt.json; independent readback and idempotent replay passed. Deployed workbench loaded Juppanese at 60 nodes / 90 edges (bounded view). This is separate from the collector and final import. Retain this delta alongside the Lowe-Edmunds delta when constructing the next snapshot/CAS baseline; no overwrite of provider rows or research claims. See docs/research/2026-10-18-mickey-jupp-discovery.md for sources, scope, commands and limitations.

## Interactive discovery graph - 18 October 2026

Nick selected the conversation's interactive graph as the app reference. The workbench now defaults to a button/SVG discovery view with focused paths, an evidence/confidence/scope inspector and fullscreen viewing; Cytoscape remains available through Network view. Direct Browse/Load uses the shared presentation read with no model call. The researcher can use graph action present with a seed id or ordered public nodeIds. Exact stored identities and qualified assertions drive the display; no generated HTML or new graph facts are needed. Read docs/product/DISCOVERY_GRAPH.md for the agent contract, limits, verification and known limitations. Local natural-language and direct-browse validation displayed the saved Juppanese network (14 domain nodes, 19 connections); the two producers' partial-album assertions remained explicit. No bulk import or domain writes occurred. The supplied Astra response is summarized in docs/research/2026-10-18-astra-lowe-edmunds-reference.md; two interview sources were checked, not the full report.

Discovery deployment 856010e passed CI and live fullscreen verification (Juppanese: 14 visible nodes / 19 connections, source and confidence inspector). Dave Edmunds is the approved next research route; Gary Brooker and the Eden engineer-network routes were declined. Artist-context assertions are now supported locally for dated gear/practice/influenced-by claims; they cannot inherit to recordings or override album credits. 105 unit tests passed, 17 opt-in tests skipped; UI/API builds passed. Domain semantics version 1.3.1. New research persistence and this small runtime deployment are tracked below once verified.

## Dave Edmunds equipment and method research - 18 October

19 confidence-scored claims are saved and independently verified on main: six artist-context, six direct-recording and seven album-credit. The batch added 105 entities / 136 relationships and uploaded 34,054 compressed evidence bytes. Retain its exact manifest and receipt alongside the prior operator deltas for future catalog imports. Read docs/research/2026-10-18-edmunds-sound.md for identities, scope, sources and replay command. Artist context is now supported by ontology 1.3.1 and cannot inherit into recording credits. Runtime e425ab5 deployed successfully in run 39170424298.

Discovery/search runtime 3e802eb deployed successfully in run 39170746636. Actual deployed Browse selected Dave Edmunds as Artist, not ArtistCredit, and rendered 30 nodes / 50 connections; a filtered fullscreen view exposed the saved Stratocaster claim at 92/100 with artist-context scope and its source. Proof: output/research/2026-10-18-edmunds-sound/surface-verification.json and deployed.png. One optional chat-curation request timed out with zero reported tokens while deployment was underway; cause unestablished, chat latency remains a limitation. Browse itself uses zero model calls. Tests: 106 unit passes, 18 opt-in SQL skips; deployment UI/API checks passed. Temporary agent-owned services stopped.

## 18 October 2026 - Thunderbirds / Vaughan research saved

Nick approved the artist-first Thunderbirds/Vaughan route. The scoped operator batch committed at 23:04:10 UTC: 191 entities and 279 relationships, including 25 confidence-scored assertions (7 artist context, 14 album credits, 4 direct recording claims). Independent bounded readback and idempotent replay passed; 79,081 compressed evidence bytes uploaded to the existing private Azure container. This is an additional research delta, not the final background enrichment import. Preserve it alongside prior research during the next bulk snapshot. No listening data or existing provider rows were overwritten.

See [Thunderbirds / Vaughan research](../research/2026-10-18-thunderbirds-vaughan.md) for source limitations, parent corrections, exact receipt/replay command and future choices. Deployed Browse/Load and fullscreen source inspection passed (Baby, Please Come Home: 7 nodes / 6 connections). The separate conversation graph contains 21 nodes / 23 connections and verified catalog paths. No runtime code changed; chat latency and durable saved views remain separate work. Next route awaits Nick's Approve/Deny/Defer choice.

## 18 October 2026 - Talking Heads connections saved

Nick redirected the next research step to Talking Heads and the existing cohort. The shared main development batch added 93 entities / 162 relationships, including 18 confidence-scored assertions (11 album credits and 7 direct recording claims). Independent ID-bounded readback and idempotent replay passed. New private Azure evidence is 29,196 compressed bytes. See docs/research/2026-10-18-talking-heads-discovery.md for the MacColl/Bremner/Rockpile and Belew/Bowie/Vaughan paths, exact identities, scope, sources and replay command.

Deployed Browse/Load and fullscreen inspection displayed the saved Desperate Character -> Billy Bremner claim at 96/100 with album scope and source. The separate interactive conversation graph contains 20 nodes / 23 selectable connections. Ambiguous title search still picks a top match (Naked selected an unrelated recording); explicit disambiguation remains a product limitation. No runtime code changed. Preserve the exact operator delta under output/research/2026-10-18-talking-heads/ alongside the previous research batches in the next catalog/CAS baseline. This is separate from background collection and its final import. Proposed next step is MacColl/Bremner's artist network; approval is pending.

## 18 October 2026 - Belew / Eno connections saved

Nick declined the MacColl/Bremner expansion and approved the Belew/Eno route. The shared main development transaction committed at 00:05:37 UTC on 19 October (18 October locally): 116 entities / 196 relationships, including 14 confidence-scored assertions (9 album credits, 3 original-recording claims, 2 artist-context claims). Independent bounded readback and idempotent replay passed; 65,508 compressed evidence bytes were uploaded and verified in the existing private Azure container. Source and method analysis: docs/research/2026-10-18-belew-eno-discovery.md. Two Luna/Medium researchers completed; Astra/High hit capacity twice after partial notes, so the parent completed review.

The new bridge is Eno -> Chris Spedding -> Mickey Jupp -> Lowe/Edmunds, retaining the different Juppanese side credits. Cale connects through Slow Dazzle and Wrong Way Up. Repetitive-layer construction connects Remain in Light and Bush of Ghosts; Lodger has a separate composite-guitar technique. Oblique Strategies remains artist context at 62/100. Deployed fullscreen inspection of Wrong Way Up showed the saved Eno claim at 98/100 with source. The separate conversation graph has 21 nodes / 24 connections. Search still chooses an ambiguous top match, and the 16-track Technique seed did not retrieve its incoming assertion; those are product retrieval limitations, not missing persisted claims.

Preserve output/research/2026-10-18-belew-eno/ with the five earlier operator research deltas in the next bulk baseline. This is not completion of the background MusicBrainz collection/final import. No listening writes, full database scans, new collector or billing changes occurred. No runtime code changed. Chris Spedding's wider artist/session network is proposed for the next Approve/Deny/Defer decision; no new branch has started.

## 18 October 2026 - Paul Weller / Jam / solo research saved

Nick redirected the Spedding proposal to Paul Weller across the Jam and solo career. The shared main transaction committed at 2026-10-19T00:50:41.130Z: 191 entities / 345 relationships, including 30 sourced assertions (9 album-credit, 20 direct-recording, 1 artist-context). Independent bounded readback and idempotent replay passed. Private Azure evidence added 86,259 compressed bytes. Two Luna/Medium researchers and a completed Astra/High review supplied candidates; the parent resolved exact identities and finalized scopes.

Read docs/research/2026-10-18-weller-discovery.md for the Jam -> Bechirian -> Costello/Lowe path; Talbot, Winwood, Gallagher and Cradock recording roles; Wyatt/Eno and Rodgers repertoire bridges; and exact guitar/keyboard/method factors. The conversation map has 30 nodes / 32 selectable connections with saved backing paths. Deployed fullscreen Find El Dorado inspection exposed Cradock's producer assertion at98/100 with source. Search still selected the All Mod Cons song instead of the album; no runtime fix is claimed.

Preserve output/research/2026-10-18-weller/ with the six prior operator deltas in the next bulk catalog/CAS baseline. This is a research addition, not the final background enrichment import. No listening writes, full scans, new background collector or billing changes. No runtime code changed. Nick declined Winwood/Traffic and approved Cradock/OCS/Oasis; the completed research is recorded below.

## 18 October 2026 - Cradock / OCS / Oasis research saved

Nick declined Winwood/Traffic and approved the Cradock/OCS/Oasis route. The shared main development batch committed at 2026-10-19T01:05:34.040Z: 322 entities / 470 relationships, including 30 confidence-scored assertions (18 direct recording, 9 album-credit, 3 artist-context). Independent bounded readback and idempotent replay passed. Private Azure evidence added 152,892 compressed bytes. Two Luna/Medium workers and an Astra/High reviewer supplied candidates; parent source/identity review finalized the packet.

Read docs/research/2026-10-18-cradock-ocs-oasis-discovery.md for Weller's exact OCS/Oasis parts, the separate Fire and Skill performances, Echoes Round the Sun, the Come Together shared session, the gifted Rickenbacker, Black Barn and Lynch's production methods. The conversation map has 28 nodes / 39 connections, with saved assertion/catalog paths checked. Deployed Browse/Load and fullscreen Moseley Shoals inspection displayed 7 nodes / 6 connections and the Les Paul assertion at 95/100 with source and scope. No runtime code changed; a durable saved-view library and broader retrieval remain incomplete.

Preserve output/research/2026-10-18-cradock-ocs-oasis/ with the seven earlier research deltas in the next bulk catalog/CAS baseline. This is not the final background enrichment import. No listening writes, full database scans, new background collector or billing changes. Nick redirected the Arnold proposal toward the main guitarists' equipment and recording techniques; the completed research is recorded below.

## 18 October 2026 - Guitar equipment and recording methods saved

Nick requested deeper instruments, effects, recording techniques and equipment within the existing cohort. The main development transaction committed at 2026-10-19T01:21:17.245Z: 166 entities / 201 relationships, including 40 confidence-scored assertions (11 artist-context, 19 album-credit, 10 direct-recording). Independent bounded readback and idempotent replay passed. Private Azure evidence added 30,100 compressed bytes in 41 verified documents. Two Luna/Medium researchers and an Astra/High reviewer supplied the packet; parent identity and scope review finalized it.

Read docs/research/2026-10-18-guitar-sound-deep-dive.md for Weller amp breakup and digital assembly; Cradock pedals/Leslie; Noel's clean/dirty amps and live Tube Screamer; Jimmie setup/Bassman/Flint; SRV amp miking and Dimension D; Belew's qualified Listening Wind effects; and Edmunds overdubbing/non-quantized workflow. Existing Guitar overdubbing, Stratocaster, Electric Mistress, Bassman and live-band factors were reused. The unsupported Powerful Stuff tuning attribution was excluded.

Deployed fullscreen Steve Cradock inspection displayed 17 nodes / 21 connections and the newly saved DS-1 claim at 87/100 with source, reason and 2023 artist context. No runtime code changed. Preserve output/research/2026-10-18-guitar-sound-deep-dive/ with the eight earlier research deltas in the next catalog/CAS baseline. This is not completion of the final background enrichment import. No listening writes, full scans, new collector or billing changes occurred. Next proposed work remains within this cohort: compare attack, effect movement and layering, subject to Nick's choice.

The curated conversation guitar map shows 31 nodes / 25 connections, backed by 14 saved assertions and 21 catalog path relationships. Node selection, source/confidence inspection, restored state and narrow layout were browser verified. See the research report for proof paths and the remaining saved-view-library limitation.
