# Bounded enrichment research team

Nick requested this division of work on 18 October 2026: GPT-6 Luna at Medium for source research, followed by GPT-6 Astra at High for review and collation. The first batch runs as Codex subagents against the private ten-album pilot. It is an operator workflow, not a newly deployed application service. The ordinary MusicMesh researcher remains GPT-6 Luna/high.

## Working method

1. Start with existing identities, cached provider relationships and a specific evidence gap. Give each worker a small, non-overlapping question and local input paths; do not send the full graph or listening history.
2. Luna researchers inspect sources for instruments/models, personnel, studios and recording context. Return atomic proposed facts with source URL, source type, short quote or labeled summary, 0-100 confidence and rationale, album/track scope, identity candidates, uncertainty and missing evidence. Label paraphrases as summaries, never quotations. General equipment ownership is not evidence of session use.
3. Astra reviews the compact claim set, checks the important sources independently, resolves contradictions and distinguishes supported facts, qualified provider assertions, unverified leads and rejected claims. Repeated metadata from one upstream source is not independent corroboration.
4. Collate the corrected claims and remaining identity/evidence requirements in private JSON and Markdown. Keep original worker output for audit. Preserve uncertainty with scored assertions rather than rejecting useful tentative findings.
5. Match catalog identities, split multi-factor claims, and persist sourced tentative assertions using the confidence contract. Missing provider IDs for local factors and incomplete verification are not automatic blockers. Research files alone are not imported graph records. Existing user authorization remains applicable; unresolved choices in the app use Approve/Deny/Defer.

Album-first means gathering shared session evidence once. An album production credit uses `album-credit`; only explicit evidence of applicability to every track permits `all-tracks`. A track exception uses `direct` and names the overridden assertion and release. Compilations require original recording/session joins. Live recordings, remixes and re-recordings must remain distinct.

Instrument family and equipment model are separate facts. A shared Hammond organ credit does not prove the same model, setting, performance technique or reason for a listener's preference. Preserve performer-to-instrument context instead of flattening a list of names into unrelated factors.

## Efficiency and stopping rules

- Reuse local MusicBrainz responses and checked sources. No daily full-record Neon downloads or duplicate source searches across workers.
- Research the likely high-value bridges first: the same person, studio or specific instrument across distinct recordings/artists. Do not count compilation overlap as independent preference evidence.
- Give each batch a source/request bound. The first Astra review was limited to 12 distinct source URLs; inaccessible sources remain explicit gaps rather than triggering unlimited retries.
- Stop when the requested question is answered or further searches yield no stronger evidence. Return a focused next question for unresolved items.
- Use Astra on the completed batch and contested facts, not on every browse step or ordinary user answer.
- Actual billable token/cost totals are not available from these subagent results. Model selection and bounded inputs are an efficiency strategy, not a measured cost saving.

## First batch and local artifacts

Two Luna/Medium researchers completed instrument and personnel/studio work, producing 11 candidate claims. A third planned worker could not start because the concurrent agent limit was reached. Astra/High reviewed the batch after a slot became available. Version/edition checks are part of review; the sparse-album research lane has not been completed.

Private directory: `output/research/2026-10-18-enrichment-team/`.

- `instruments.json`, `instruments.md`: first worker output.
- `personnel.json`, `personnel.md`: second worker output.
- `review.json`, `review.md`: independent reviewer decisions and checked sources.
- `reviewed-candidates.json`: corrected staging records, preserving links to original claim IDs and import blockers.
- `REPORT.md`: collated outcome, scope limitations and next research targets.

Read the local report with:

```powershell
Get-Content -LiteralPath 'output/research/2026-10-18-enrichment-team/REPORT.md' -Raw
Get-Content -LiteralPath 'output/research/2026-10-18-enrichment-team/reviewed-candidates.json' -Raw
```

These files contain private library context and stay ignored. Public documentation records the method and aggregate status only. The original research batch itself made no database changes. One claim has now been saved and reassessed through the workbench under the approved confidence policy; remaining candidates are still staged. No collector, billing or Qobuz changes were made. Roon remains the approved source for attributed genre/library context; MusicBrainz and inspected credit sources supply other relationships.

Runtime contracts: `src/enrichment.js`, `src/researchTools.js` and `src/researchStore.js`. Before later evidence upload/import, follow [EVIDENCE_STORAGE.md](../product/EVIDENCE_STORAGE.md) and [OCTOBER_NEON_BUDGET.md](../product/OCTOBER_NEON_BUDGET.md).

## Expanded source discovery after the pilot

Include community gear indexes (for example Equipboard), manufacturer/artist interviews, specialist instrument magazines, session accounts, tutorials and tablature. Follow each useful claim to its underlying evidence. A source can be useful without proving original session equipment. Keep four meanings distinct: documented session use; artist/live/band context; cover-tone recreation guidance; and sonic hypothesis. Music videos, live footage and ownership lists do not automatically establish recording-session use. Hashtags do not identify equipment, and syndicated or copied summaries are not independent corroboration.

The private `ONE_HEADLIGHT_SOURCE_FOLLOWUP.md` and `one-headlight-source-followup.json` record a parent-researched supplement to the first batch: supplied links, access failures and six scoped candidates, including playing-technique and mixing evidence. This supplement has not received the separate Astra review and has not been imported. Preserve useful artist-to-equipment observations with date/event context; the current recording/album assertion contract cannot be stretched to accept Artist subjects. A typed extension is needed before storing such observations through that path.

## Confidence policy supersedes original readiness gates

See [CLAIM_CONFIDENCE.md](../product/CLAIM_CONFIDENCE.md). Save sourced tentative assertions with confidence, rationale and history. Raise or lower assessments as support or contradictions arrive. Preserve original reviewer files as historical outputs; do not interpret their former graph-readiness flags as the current persistence rule. The private confidence-main-receipt.json records the first actual saved claim and revision.
