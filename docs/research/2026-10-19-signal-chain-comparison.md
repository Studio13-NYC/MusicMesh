# Weller, Cradock and Gallagher: guitar signal chains

19 October 2026. Nick approved comparison of guitar, effects, amplification, capture and arrangement within this cohort. Two Luna/Medium researchers and an Astra/High reviewer supplied candidates; the parent checked sources, identities, scope and persistence.

## What the comparison tells us

Equipment is one useful connection, but the role of the guitar and the way a part enters a recording are equally valuable. The following are documented contexts, not universal artist rigs:

| Context | Guitar and amplification | Arrangement / capture | Remaining gaps |
| --- | --- | --- | --- |
| Weller, *Going Underground* (1980) | Rickenbacker 330 rhythm, custom Junior-style harmony leads; cranked Vox AC30 | Distinct rhythm and harmony-lead roles | Microphones, settings, exact picking and mix placement |
| Cradock, *Moseley Shoals* (1996) | Les Paul paired with Marshall JCM800 | Most songs captured with the band together, then overdubs | Guitar microphone, cabinet, settings and song-specific pedal use |
| Gallagher, *Standing on the Shoulder of Giants* (2000) | Strat, Telecaster and Les Paul Deluxe among session choices; Princeton clean, Bandmaster dirty | Parts developed against the evolving mix; small miked amp described | Per-song guitar/amp pairing and microphone models |

The Weller instrument and natural-overdrive claims were already saved. His custom Junior-style guitar must not be relabeled a factory Gibson. Corrugated iron around the amp belongs to the separate *Eton Rifles* account; its use on *Going Underground* is only suggested. [Weller interview](https://www.musicradar.com/news/the-jam-paul-weller-going-underground-interview).

Cradock's early Telecaster/Twin Reverb rig, 1996 Les Paul/JCM800 pairing and later Blackstar/Boss/Leslie references are distinct periods. The latter cannot establish a 1996 pedal chain. [Cradock interview](https://www.guitarworld.com/features/steve-cradock-ocean-colour-scene-paul-weller), [album liner notes](https://danielrachel.com/writings/ocean-colour-scene-moseley-shoals/).

For his 2013 solo album *Travel Wild – Travel Free*, Cradock describes complementary guitar parts with a Revolver-inspired texture and alternating studio visits with home arrangement work. The source does not establish double-tracking or stereo placement. These claims are saved on the artist with explicit album context because the album identity was not resolved in this bounded pass. [2013 interview](https://louderthanwar.com/steve-cradock-in-conversation/).

## New routes worth following

On *Put Yer Money Where Yer Mouth Is*, Gallagher recalls an unnamed engineer's slide guitar through an EMS synthesizer, without a guitar amp. The Ibanez identification is tentative. On *Who Feels Love?*, two-guitar playing and subsequent Pro Tools editing provide a different route to unusual textures. Both claims target the original studio recordings, not every version. [Archived firsthand interview](https://oasisinterviews.blogspot.com/2000/01/noel-gallagher-guitar-playercom-2000.html).

Anjali Dutt describes keeping Noel's layers present and emphasizing selected riffs in her Eden mix. That differs from Owen Morris's later mix. We save her technique on her artist identity rather than mislabel it as the finished album's universal method. [Dutt correspondence](https://www.oasis-recordinginfo.co.uk/more-from-anjali-dutt-on-the-making-of-definitely-maybe-2014.html).

Gallagher's early Monnow Valley AC30/HH setup is also separate from subsequent sessions. The project did not discard every Monnow performance: the Dutt account identifies *Slide Away* as carrying through. [Gallagher retrospective](https://www.loudersound.com/news/noel-gallagher-on-the-version-of-definitely-maybe-that-oasis-were-forced-to-can).

## What this means for taste exploration

The next useful comparison is between **interlocking parts**, **continuous layers** and **guitar parts chosen to fit a nearly finished mix**. These are hypotheses about what Nick might respond to, not established preference scores. A common amp can be a research lead without proving a common sound. Modulation, reverse editing and synthesizer processing should remain separate mechanisms. No audio measurements or exact picking analysis were performed in this step.

## Saved state and verification

The shared development transaction committed at `2026-10-19T09:20:25.512Z`: **67 entities and 123 relationships**, including **12 new confidence-scored assertions** (8 artist-context, 1 album-credit, 3 direct-recording). Scores range from 76 to 94. Existing Weller and OCS claims were reused rather than duplicated. A single paired-guitar Technique was created because the source does not specifically establish overdubbing.

The batch includes four bounded MusicBrainz identity lookups and 29,885 compressed provider-evidence bytes uploaded to the existing private Azure evidence container. Independent bounded readback verified 43 catalog/factor nodes, 87 catalog relationships and all 12 assertions with initial confidence history. Idempotent replay returned the existing receipt. No listening-history writes, full database scan, background collector restart, bulk import or billing change occurred.

Private operational files are under `output/research/2026-10-19-signal-chains/`: `final-review.json`, `claims.json`, `factor-identities.json`, `source-texts.json`, `main-persistence-receipt.json`, `main-readback.json`, and `evidence-archive/`. They remain ignored, consistent with previous research packets. Preserve this delta with the nine prior research deltas in the next bulk baseline.

Recheck the frozen batch without repeating writes:

```powershell
node --env-file=.env output/research/2026-10-19-signal-chains/persist.cjs
```

The conversation comparison is a separate interactive presentation of these saved facts and explicit gaps. It does not add a signal-chain class, ordered routing relationships or a saved-view library to the app. The app continues to expose the underlying evidence through its existing Discovery view.

Deployed Browse/Load retrieved *Put Yer Money Where Yer Mouth Is* with 18 nodes and 19 connections. Fullscreen inspection showed the saved EMS assertion at 80/100, its direct-recording scope, named source and performer caveat. Proof: `output/research/2026-10-19-signal-chains/deployed-ems-claim.png`. The comparison supports source inspection and restored selection; a 360px preview wrapper verified stacked lanes without horizontal overflow. Desktop and narrow proof images sit alongside the receipt.

The effects comparison also reuses the previous batch: Weller's unidentified synth-style pedal on *Saturns Pattern*, Cradock's later Boss/Leslie preferences, and Gallagher's live Tube Screamer boost. These are deliberately separate from the three principal recording contexts. The 1995 *Morning Glory* SM57/U87 capture account supplies a known microphone example, without inventing positions or blends. See [the preceding equipment report](2026-10-18-guitar-sound-deep-dive.md) for those saved sources and boundaries.
