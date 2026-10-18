# Dave Edmunds: guitar sound, equipment and recording methods

18 October 2026. Nick selected this route after declining the Brooker and Eden engineer-network branches. Research starts with Edmunds's artist associations and follows documented instruments and methods into specific albums and recordings. Listening history does not limit eligibility.

## What we found and saved

| Connection | Scope | Confidence |
| --- | --- | ---: |
| Edmunds -> Chet Atkins influence | Artist context | 86 |
| Edmunds -> fingerstyle guitar | Artist context, including Jimmie Vaughan's recollection | 84 |
| Edmunds -> Fender Stratocaster | Artist context in 2015 | 92 |
| Edmunds -> Gibson ES-335 / Switchmaster | Tentative artist gear context from indexed 1982 interview excerpts | 65 / 60 |
| Edmunds -> direct guitar recording through the console | Rockpile-era artist context | 88 |
| His 2015 God Only Knows -> Telecaster | Direct recording evidence in Edmunds's answer | 88 |
| His 2015 A Whiter Shade of Pale -> Stratocaster | Direct recording; interview writer identifies a 1959 instrument | 86 |
| His 2015 Your Song -> Taylor guitar and a single-take guitar foundation | Two direct claims; bass and keyboard strings added later | 93 each |
| Rags & Classics -> Logic Pro 9 and Edmunds performance | Two non-inheriting album credits | 95 each |
| Seconds of Pleasure -> guitar overdubbing and Edmunds performance | Two non-inheriting album credits | 89 / 93 |
| Tuff Enuff title recording -> six-string bass and layered bass overdubbing | Two direct claims from the same interview; not independent corroboration | 86 each |
| Tuff Enuff album -> Vaughan's Fender Bassman / Super Reverb and Edmunds production | Three non-inheriting album credits | 88 / 88 / 93 |

These are 19 assertions: six artist-context, six direct recording and seven album-credit. Scores are documented research judgments with revision histories, not calibrated probabilities. Artist context never becomes a default recording credit. A song title alone does not identify the recording: the 2015 Edmunds performances remain distinct from the Beach Boys, Procol Harum and Elton John originals.

## Sources and limitations

- [Ray Shasho's Edmunds interview, Keys and Chords](https://www.keysandchords.com/an-interview-with-dave-edmunds.html): Atkins influence, Stratocaster, Telecaster on his God Only Knows, and Taylor/Logic workflow for Your Song. Full text inspected.
- [Mike Mettler's Edmunds interview, Sound & Vision](https://www.soundandvision.com/content/dave-edmunds-serves-all-instrumental-pleasures-rags-classics): Rags & Classics home recording and the writer's Stratocaster identification. Full text inspected; narrative attribution preserved.
- [Barbara Schultz's Aldo Bocca session account, Mix](https://www.mixonline.com/recording/classic-tracks/classic-tracks-rockpiles-teacher-teacher-428925): console recording and Rockpile overdubbing. Full text inspected. Bocca does not recall the exact Teacher Teacher effect; none was invented.
- [Andrew Daly's Jimmie Vaughan interview, Guitar World](https://www.guitarworld.com/artists/guitarists/jimmie-vaughan-fabulous-thunderbirds-tuff-enuff): Vaughan's amps, Edmunds's fingerstyle and approximately three or four bass overdubs on the title track. Full text inspected. The six-string bass model, tuning and player are not established by the saved claim.
- [Mix, February 1982](https://www.worldradiohistory.com/Archive-All-Audio/Mix-Magazine/80s/82/Mix-1982-02.pdf): indexed excerpts supplied the tentative ES-335 and Switchmaster leads. Full PDF/page verification failed; lower confidence and that access limitation remain attached. A suspect 1957 ES-355 identification was excluded, not silently repaired.

Conflicting early tape-format accounts for I Hear You Knocking remain unresolved. No universal Edmunds signal chain, pickup setting or amplifier is inferred. General methods and gear do not establish why Nick likes a recording without listening/preference evidence.

Two GPT-6 Luna/Medium researchers and a GPT-6 Astra/High reviewer supplied the source review. The parent reconciled identities, added five separately scoped assertions from those reviewed sources, and verified persistence. This is an operator-led research batch, not an automatic multi-agent application service. The application remains GPT-6 Luna/high.

## Saved database state

The main transaction completed at **2026-10-18T22:03:04.990Z**:

- 67 catalog/factor entities and 79 provider/structural relationships.
- 19 EvidenceAssertions, 19 SourceDocuments and 57 assertion relationships.
- **105 added entities and 136 added relationships total.**
- **34,054 compressed bytes** newly uploaded and verified in the existing private Azure evidence container.

Existing provider identities were reused without overwrite. Constructors, the domain repository and the existing decision persistence transaction were used. The actual conversation authorization is retained; no app-modal click is claimed. Independent ID-bounded readback confirmed all 19 assertions at revision 1, the 67 catalog entities and 79 catalog relationships. Idempotent replay returned `alreadyCommitted:true`.

This delta is separate from the background collector and `main-development-snapshot-3`. Preserve it, the Lowe-Edmunds delta and the Mickey Jupp delta when constructing the next bulk compare-and-swap baseline. Do not overwrite local assertions or reset listening data. No full database scan, full verification replay, new background collector, billing change or listening write occurred.

## Runtime and reproduction

Artist context is implemented in `src/enrichment.js`, `src/researchTools.js` and domain ontology version 1.3.1. Artist claims permit instrument/equipment/technique/genre/influenced-by, require `scope:artist-context` and `mode:add`, and reject album defaults, edition restrictions and overrides. The existing credit resolver excludes this context from recording credits. Tests: `tests/artistContext.test.js`.

Private frozen evidence is under `output/research/2026-10-18-edmunds-sound/`: `claims.json`, `source-texts.json`, `responses.json`, `provider-responses/`, `catalog-extension/`, `evidence-archive/`, `main-persistence-receipt.json` and `main-readback.json`.

```powershell
node --env-file=.env output/research/2026-10-18-edmunds-sound/persist.cjs
```

The replay key is `operator-enrichment:6c5132c285561cc4e3a50d803e179f85395fe5c0d41312ff6bf2a351581803dd`. Do not rerun preparation to regenerate the frozen factor identities.

The interactive [Discovery view](../product/DISCOVERY_GRAPH.md) exposes these saved claims with scope, source and confidence. Browse search now ranks exact matches before partial matches, then musical entities before structural billing/evidence records, then degree. This resolves the observed Dave Edmunds billing-credit misselection without merging identities. The live bounded search returned the Artist ahead of its higher-degree ArtistCredit.

Deployment `3e802eb` passed in [run 39170746636](https://github.com/Studio13-NYC/MusicMesh/actions/runs/39170746636). The deployed Browse search selected Edmunds's Artist and displayed 30 nodes / 50 connections. Hiding recordings reduced the view to nine nodes / eight connections; the incomplete All Men Are Liars assertion correctly remains visible rather than inventing a dangling album link. The fullscreen Stratocaster inspector exposed artist-context, the 2015 summary, 92/100 and the real source URL. Private proof: `surface-verification.json`, `deployed.png` in the batch folder. Direct browsing and selection use no LLM calls.

One optional chat request to curate 17 supplied IDs timed out with zero tokens reported while deployment was underway. It did not produce the requested curated view or save domain data. The cause was not established; this is not proof of an OpenAI outage or resolved chat latency. The successful proof above uses Browse. Tests/build: 106 unit tests passed, 18 opt-in database tests skipped, UI/API deployment checks passed. The new SQL-ranking fixture was not run against an isolated database; a bounded live main search and deployed UI independently verified the observed search correction. Temporary agent-owned local API/Vite processes were stopped; user services and the collector were left alone.

## Possible next routes

1. **Chet Atkins and Merle Travis:** artist associations, fingerstyle methods, then documented recordings and equipment. Chet's influence claim is saved; the broader network awaits approval.
2. **The Fabulous Thunderbirds and Jimmie Vaughan:** Edmunds's production, rhythm section, bass layering and guitar sound across their artist network.
3. **Early Edmunds at Rockfield:** reconcile the I Hear You Knocking recording accounts and identify documented tape, overdubbing and room techniques.

Subsequent decision: Nick declined the Chet Atkins route and approved the Thunderbirds/Vaughan network. That bounded step is now [saved and verified](2026-10-18-thunderbirds-vaughan.md). The early Rockfield route remains a possible choice, not research already performed.
