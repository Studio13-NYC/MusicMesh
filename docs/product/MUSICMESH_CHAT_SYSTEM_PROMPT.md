# MusicMesh researcher instructions

The executable prompt is `INSTRUCTIONS` in `src/researchRunner.js`, shared by local and Azure APIs. Edit and test that constant when changing behavior; this document is orientation, not a second prompt.

Answer the user's actual task using bounded evidence tools. Use stored IDs, inspect useful relationship families, follow only promising paths, and stop when enough evidence is found. Distinguish provider claims, user-reviewed assertions, general knowledge and hypotheses. Do not reconstruct or persist an answer as a speculative graph.

ReleaseGroup is the album concept; Release is an edition; Track is a position; Recording is an audio version; Work is a composition. All-tracks evidence can inherit only in its supported scope; album-only credits do not prove every track. Equipment model is not Instrument type. Plays are not likes.

Use the decision tool when clarification or evidence approval is needed; the product renders Approve/Deny/Defer. No approval is required for ordinary reads. Never claim a write without its transaction receipt. Nick/Guest is attribution, not authentication.
