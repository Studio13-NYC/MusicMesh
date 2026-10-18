> Current runtime: [researcher handoff](../product/CURRENT_STATE_AND_HANDOFF.md). Earlier pipeline notes below are historical; the automatic preview/planning path is retired.

# Repository audit — 17 October 2026

Scope: tracked files, the four initially untracked directories, root build/cache paths, source references, and deployment configuration. `STAY/` and the protected clean-sheet archive are excluded from deletion. This is a repository relevance/ownership audit, not a full security or dependency-vulnerability audit.

## Delete

| Path | Evidence / reason |
|---|---|
| `ui/src/data/workspace.js` | No imports/references outside its own declarations. Old mock thread/trace data, unused by current app. |
| `walkthrough.md` | Describes removed Proposals/Apply workflows and links to missing screenshot assets. Conflicts with the current operator contract. |
| `data-lastfm/recenttracks-bobdobbsnyc-1792084706.zip` | Confirmed SHA-256 equality of its CSV member and the retained uncompressed CSV. Redundant container. |
| `data-lastfm/__pycache__/` | Reproducible Python bytecode cache. Ignore future bytecode. |

## Track

- Music data standards research, model/import specification, inventory, and aggregate history profile.
- `data-lastfm/import_listenbrainz.py` and `data-lastfm/README.md`: reusable import/verification tool and its operating instructions. The prior import is complete; do not rerun submission.
- `exa-results/three-track-pilot-2026-09-19/` reports, evidence, measurement summaries, and analysis source. These remain useful for the explicit request for musical/acoustic connections; they are not imported catalog facts.
- Existing application code, current docs, migrations, tests, and workflows.

## Retain locally and explicitly ignore

- `.env*`: credentials and isolated database configurations.
- `data-lastfm/*.csv`, `*.json`, `*.png`, `*.zip`: private historical input, conversion, receipts, and account screenshot. The CSV and receipt are needed for the next import.
- `exa-results/**/captures/`: original/derived audio and associated capture evidence. Do not publish captured music to the public repository.
- Existing generated/build/dependency paths (`node_modules`, `generated`, `api/shared`, `api/generated`, `output`, etc.) remain reproducible or operational artifacts; they are already ignored.

## Retain deliberately

- `ui/src/concept/`: still explicitly routed by `ui/src/main.jsx` at `/concept`; not unused. No route removal was inferred from the cleanup request.
- Historical refactor proposal and its diagrams: already labeled historical and linked to current documents. They preserve rationale and are not falsely presented as current behavior.
- September migration evidence: retained with a historical heading and an October supersession note in the handoff.

## Validation

Before committing: check staged filenames, scan new text for embedded credentials, run `git diff --check`, `npm test`, and `npm run build`. After pushing: verify both tag targets and branch SHA against origin; check GitHub Actions. A clean `git status --short` includes deliberately ignored private/generated files remaining on disk. It does not mean those files were uploaded or deleted.
