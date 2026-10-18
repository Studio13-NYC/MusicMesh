# MusicMesh researcher and evidence enrichment

Approved direction: Nick, 18 October 2026. Implementation status is recorded in the companion plan and CURRENT_STATE_AND_HANDOFF.md; this specification does not claim features are already deployed.

## Outcome

Keep the object-oriented music domain, Prisma/PostgreSQL graph, private Azure Blob evidence, and chat/Cytoscape workbench. Replace the mandatory answer/preview/plan/ground/review chain with one task-directed researcher using OpenAI Responses API `gpt-6-luna`, reasoning `high`. The account accepted this combination in a live probe. This is application API usage, separate from the Codex conversation model and ChatGPT subscription.

Simple questions should need one model answer, plus only necessary retrieval. Existing graph facts must render using their stored IDs, without a second model inventing a preview and a third matching it back. Exploration follows the question: inspect a node, see available relationship families and coverage, select useful paths, stop when evidence suffices. No obligatory traversal, minimum connection count, or invented graph writes.

## Research execution

One shared server implementation serves local Node and Azure Functions. Each HTTP research step makes at most one model response call and executes bounded read tools. The client continues a persisted run by ID; no detached background promises. Store bounded operational state separately from domain entities. Claim work with a lease/version so retries do not duplicate model calls or accepted writes. Incomplete runs can be resumed, cancelled, or expire. The browser receives graph results and useful progress after each step, retaining the last graph while waiting. No perpetual idle tape polling.

Context contains the current question, a bounded recent conversation, selected stored ID, and compact researcher rules. Tool definitions are compact; detailed domain semantics are retrieved on demand. Limits apply to steps, calls, query result counts, history characters, output tokens, stored state, and runtime. Tool results state truncation/coverage. Repeated identical reads return cached results; repeated unproductive exploration stops. Provider text is untrusted evidence, never instructions. Log actual token usage, latency, tool calls and final state. Automatic model review is removed from normal requests.

Tools cover entity search/detail, one-hop adjacency counts and chosen neighbors, release tracklist, listening aggregates, acoustic comparisons, source availability/search, evidence retrieval, scoped enrichment, and explicit preference factors. SQL reads project compact fields and apply limits before materializing neighbors; no whole-database download or recursive unbounded path expansion. Existing imported identities and evidence protections remain intact.

## Album evidence and track exceptions

ReleaseGroup is the album concept; Release is an edition; Track is a position; Recording is recorded audio; Work is composition. Credits for a particular edition must not silently apply across other editions, mixes, bonus tracks, or compilations. Default enrichment attaches to a specific Release unless a source explicitly supports the broader ReleaseGroup. Recording/Track assertions can add to, exclude, or override a named album assertion. Track evidence alone cannot establish an album-wide fact. Research may propose wider applicability for review, preserving the original narrower assertion.

Use SourceDocument and EvidenceAssertion domain objects with source URL/title, short evidence excerpt, retrieval time, subject and factor identities, role, scope, applicability, certainty and provenance. Equipment model (for example a guitar make/model) remains distinct from Instrument type. Producer, engineer and performer are Artist roles; studio is a Place. A source may support an album credit without proving participation on every track: distinguish `album-credit` from `all-tracks`. Only the latter inherits to tracks by default. Inheritance is resolved at query time rather than duplicating assertions onto every recording. Show inherited/direct/excluded/conflicting status and supporting assertion IDs. Conflicts remain visible; a newer source does not silently replace an older source.

Persist only claims reviewed against actual retrieved source evidence or explicitly attributed to the user. Model memory alone is not provider evidence. Reuse canonical target identities and never overwrite provider-imported objects. Large source bodies stay in Blob; short quotations and compact assertions remain in Postgres. Source search snippets are discovery aids, not proof of a credit. An agent can immediately retrieve the semantic definitions and source availability.

## Preference research

A play is not a like. Explicit likes/dislikes and user-described passages are separate private PreferenceSignal objects, attributed to Nick or Guest. Compare selected liked recordings by sourced personnel, studio, instruments/models, genre and compatible acoustic features. Report shared-factor counts, evidence coverage, missingness and counterexamples. Describe possible explanations as hypotheses, never causal conclusions. Repeated plays can prioritize investigation, explicitly labeled as listening frequency. Genre counts require sourced assignments; if coverage is unavailable, state it and return useful available listening counts rather than asking for an already-imported export.

## Sources

Prefer the imported MusicBrainz catalog and its relationship evidence, ListenBrainz mappings/listening events, and AcousticBrainz measurements already held. Supplement through official artist/label/studio documentation, liner notes, interviews and Discogs credits, with identity and scope checks. Last.fm tags/similarity are attributed community signals, not authoritative recording credits.

Roon's supported extension API discovers a local Core and exposes browse, image and transport services. A Core must authorize services. This does not establish a bulk detailed-credits export API: treat Roon as a local library/playback context candidate until verified. Qobuz's API terms require a granted application ID/secret; a subscriber login does not establish developer access. Record unavailable integrations honestly; do not scrape private application secrets or claim connectors are working. Queryable public sources and user-supplied evidence work independently of optional integrations.

Primary references checked 18 October 2026:
- https://github.com/RoonLabs/node-roon-api
- https://roonlabs.github.io/node-roon-api/RoonApiBrowse.html
- https://static.qobuz.com/apps/api/QobuzAPI-TermsofUse.pdf
- https://static.qobuz.com/apps/api/Qobuz-AppsGuidelines-V1.0.pdf
- https://musicbrainz.org/doc/Relationships
- https://developers.openai.com/api/docs/guides/function-calling

## Decisions and attribution

Assume Nick in the development workbench; allow Guest contribution attribution. This is a convenience identity, not authentication. Keep raw private listening/mapping records excluded from public graph browsing. Explicit aggregate tools can use Nick's imported history in this single-owner development instance. No authentication project is a prerequisite.

When the researcher needs a choice or permission, return a persisted decision rendered as a modal with **Approve, Deny, Defer**. Include what will happen, evidence, scope and any identity choices. Approval binds to the exact action payload and version; validate all preconditions at execution. Duplicate approval is idempotent; stale or conflicting decisions fail safely. Deny rejects the action; Defer preserves it for later and stops dependent work. Approval cannot execute arbitrary SQL or arbitrary tool names. Normal read exploration requires no approval. No generic 'approve' chat command is a substitute for the decision record.

## Cleanup and acceptance

Remove the old automatic graph orchestration from the live chat path and purge executable Neo4j/Aura-specific code, dependencies, settings, and current guidance. Preserve stable graph IDs, protected archives, original data, and historical user transcripts. Clearly label retained historical discussion as obsolete.

Acceptance: selected release country answers from stored data; node expansion returns real bounded graph IDs; genre question uses imported history with coverage; a simple answer triggers no preview/planner/reviewer calls; research decisions survive retry/defer/resume; track overrides do not cross editions; raw private records remain excluded; local and Azure share the same path; live workbench proves graph and modal behavior. Test failures and unavailable integrations are reported explicitly. No new bulk import or full Neon scan is required for this change.
