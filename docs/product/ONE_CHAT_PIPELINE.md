# One chat pipeline

Current implementation: `researchApi` -> durable `researchStore` -> one `researchRunner` model step -> selected bounded `researchTools` -> updated run and graph -> client continuation when needed.

The app uses OpenAI Responses API `gpt-6-luna`, high reasoning. The API key belongs to the application; this is not a ChatGPT session. A simple answer completes in one call. Graph exploration uses saved identities directly; no generated preview/plan/grounding/review sequence is run. The last graph stays visible while a request is active. The UI does not poll the tape continuously when idle.

Research runs are operational Prisma rows with version/lease control, bounded JSON and 24-hour expiry. An HTTP request executes at most one model call and its bounded tool work. No background promise is relied on after Azure sends a response. Retries use requestId/version. UI Resume recovers saved work. An expired in-flight lease requires an explicit retry decision because its model result/billing is uncertain. Cancel stops future steps; a call already in flight may still be billed. User prompts and accepted decision outcomes join assistant responses on the conversation tape. Tape logging is observational: storage failures are logged, but a transcript outage does not undo committed research or graph work.

Inputs that require a choice or write produce a persisted modal decision: Approve, Deny or Defer. Approval executes only the stored allowlisted action with its exact parameters in the same transaction that records the decision. Denial stops dependent work. Deferral preserves the decision until expiry. A chat message saying 'approve' cannot stand in for this action.

Album evidence is scoped and attributed. Read [the specification](../superpowers/specs/2026-10-18-researcher-design.md), [DOMAIN_MODEL.md](DOMAIN_MODEL.md), and [CURRENT_STATE_AND_HANDOFF.md](CURRENT_STATE_AND_HANDOFF.md) for current limits and verification.
