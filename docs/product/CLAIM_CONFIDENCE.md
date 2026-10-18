# Persist research with confidence

18 October 2026. Nick approved saving sourced tentative claims and improving assessments as evidence accumulates. Perfect evidence is not a persistence prerequisite. This extends the existing EvidenceAssertion workflow, OO domain classes and Prisma graph; no schema migration is required.

## Meaning

`confidenceScore` is an integer from 0 to 100 accompanied by `confidenceReason`. It is a research judgment, not a statistically calibrated probability. Scores below 70 should be described as tentative; 70-89 indicates stronger support and 90-100 very strong support. Zero means currently unsupported; missing means unassessed. These are communication guidelines, not automatic source-rating formulas or save thresholds.

The score applies to the claim in its stated scope. Explain identity/version uncertainty in the reason. A high-confidence album credit is not proof of every track's personnel. A live gear observation does not become studio use. Missing provider IDs do not prevent creating a named typed local factor. A genuinely ambiguous subject still requires the right context or a choice; do not merge different artists or recordings just to assign a score.

## Evidence and revision

- `evidenceKind: quote` keeps exact source-text validation.
- `evidenceKind: summary` permits an explicitly labeled interpretation of retrieved source text or a supplied source summary. A bare URL or invented quote is insufficient. The writer remains responsible for whether the summary fairly represents the source; substring validation cannot establish factual truth.
- `prepare_enrichment` accepts confidence and reason; no minimum score blocks saving. The existing Approve/Deny/Defer transaction remains the app's write path. Existing authorization for operator enrichment is not revoked.
- `prepare_confidence_revision` revises a local research assertion using support, contradiction or context, with an expected revision number. It cannot alter imported provider records or silently change the subject/factor/scope.
- Each revision retains score, reason, source URL/text, evidence kind/relation, actor, timestamp and decision ID in `confidenceHistory`. The current score/reason/revision are available in compact graph results. `claim_history` returns history in pages of at most 20.
- Scores can increase, decrease or remain unchanged. The model assesses evidence; there is no source-count bonus. Reopening or copying the same source is not independent corroboration.
- The claim row is locked and its version checked in the same transaction as the update and source link. Durable decision retries remain idempotent. Old unscored assertions stay readable without assigning invented scores.

The initial source remains attached, and subsequent source links identify their evidence relation. `SupportedBySource` is the existing relationship name; its semantics now explicitly cover source context and contradiction as well as support. Read the relation metadata and assessment rather than assuming every linked source corroborates a claim.

## Use in research

The researcher can save a useful tentative lead, explain its limitations, and follow a more promising connection. It is instructed to reassess when further evidence appears. There is no new background job that automatically revisits the entire catalog, and collector downloads do not automatically rescore claims.

`credits` exposes assessment fields. `compare_factors` preserves per-claim assessments while counting a recording only once per factor. Zero-confidence claims remain inspectable but do not count as positive factor evidence. Older provider credits have no inferred numeric score. Scores are not used as causal explanations of taste.

## Verification and files

Runtime: `src/enrichment.js`, `src/researchTools.js`, `src/researchStore.js`, `src/researchRunner.js`; semantics in `src/domain/`; UI uses the existing decision modal with confidence, reason and labeled evidence.

```powershell
npm test
$env:MUSICMESH_TEST_DATABASE='isolated'
node --env-file=.env.restore --test tests/confidencePostgres.test.js tests/researchPostgres.test.js
npm run build
npm run build:api
```

Tests cover low-confidence persistence, exact quotes versus summaries, score boundaries, increases/decreases, repeated-source non-inflation, revision history, stale updates, idempotent approvals and compact retrieval. Product verification uses a real sourced album credit, with the private receipt in `output/research/2026-10-18-enrichment-team/confidence-main-receipt.json`. It is separate from the MusicBrainz collector/final catalog import.

Verification on 18 October: 96 unit tests passed (17 opt-in tests skipped); all five targeted isolated PostgreSQL tests passed; UI and API builds passed. Main workbench saved revision 1 and revision 2 of one real claim, retaining score 85/100 and two assessment entries. Zero-confidence claims cannot apply positive credits or exceptions. The API build reports an existing dependency audit warning and the UI build reports its existing bundle-size warning.

Post-write read caches are cleared after a successful decision receipt, so the same research run can see its newly saved assessment. A focused runner regression passed for this case.

Confidence runtime `5c3193e` deployed successfully in [run 39164990233](https://github.com/Studio13-NYC/MusicMesh/actions/runs/39164990233). Deployed Edge request `req-36da8a87-a097-4f1b-8aff-061152c99b7e` retrieved both assessments through claim_history and correctly explained same-source non-corroboration (4,062 total tokens). Private proof: `output/research/2026-10-18-enrichment-team/confidence-deployed-receipt.json` and `confidence-deployed.png`. CI: 97 passed, 17 opt-in skipped; targeted isolated PostgreSQL: 5 passed. GitHub code and shared development site are current.
