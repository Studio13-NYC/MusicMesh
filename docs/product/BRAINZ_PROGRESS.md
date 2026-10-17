# Brainz progress report

Updated 17 October 2026, New York time. This is the running implementation record.

## Agreed direction

Use the [standalone design](../research/2026-10-17-music-data-standards/MODEL_AND_IMPORT_DESIGN.md) and [implementation plan](../plans/2026-10-17-brainz.md). Improve the domain structure with actual classes and machine-readable semantic definitions. Keep Prisma, PostgreSQL, the generic graph persistence architecture, and the operator workbench. Import the user's 21,415-play history and enrich its catalog, not the entire global catalog. The previous generated graph is disposable and must not be reused as evidence.

## 17 October — preparation

- Compared local `main` with GitHub: both at `a9cb4d7` before changes.
- Confirmed last successful Azure build: `5a404fa`, run `34173029047`; created annotated `prebrainz` tag at that commit.
- Audited tracked files, untracked research/history, active UI imports, and CI deployment behavior. [Audit details](../research/2026-10-17-music-data-standards/REPOSITORY_AUDIT.md).
- Original history stays local and ignored; importer and documentation are source-controlled. GitHub is public. Credentials and captured music are excluded from Git.
- The `withBrainz` checkpoint is documentation and cleanup before domain/import implementation. It must never be described as a completed import.

## Implementation status

| Work | State | Evidence / limitation |
|---|---|---|
| Repository cleanup and preparation | Locally validated | Credential-pattern scan clean; unit tests 2 passed, 1 database integration test skipped; build passed. Commit/tag publication pending. |
| Domain classes and semantic catalog | Planned | Definitions cover identity, endpoints, units, provenance, and deprecated types. |
| Agent/API access to semantics | Planned | Local and Azure routes plus shared prompt context required. |
| Import preparation and validation | Planned | Existing CSV and ListenBrainz receipt available; no new import yet. |
| MusicBrainz enrichment | Blocked for live retrieval at initial check | Direct recording API returned HTTP 503; retry is required. |
| AcousticBrainz enrichment | Access verified, import pending | Count and low-level data retrieved for Severed; not a coverage audit. |
| Replacement of old database data | Not performed | User says old data is not needed. Reset only as part of verified replacement process. |

## Credentials

Database and OpenAI settings exist. MusicBrainz/AcousticBrainz public reads need no key. Full ListenBrainz export requires retrieving the existing user token again; it was not stored by the earlier import. No Last.fm API key is configured in the checked project files or process environment; the CSV is sufficient for the baseline.

## Resuming

Read this file, the plan, `git status --short`, and `git log -5`. Root `.env` is production; use an explicitly selected isolated target for write tests. Do not repeat the earlier ListenBrainz submission. Record every implementation checkpoint, executed checks, actual import totals, and unresolved external-service failures here.
