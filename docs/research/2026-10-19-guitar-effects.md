# Guitar effects connected to recordings

19 October 2026. Nick approved following rotary sounds, modulation, reverse editing and synthesizer processing across Weller, Cradock and Gallagher. Two Luna/Medium researchers and an Astra/High reviewer supplied candidates. The parent checked sources and recording identities, corrected attribution, and saved the approved scope through the existing domain writer.

## Findings

| Artist / recording | Documented connection | Confidence / scope |
| --- | --- | --- |
| Paul Weller — Green | Guitar through Korg Monotron; selective EQ and console compression at mix | 94 / 91; original Sonik Kicks recording |
| Paul Weller — Dragonfly | Reversed acoustic audio with an unspecified Bomb Factory plug-in; acoustic looping and electric-part editing | 94 / 93; original Sonik Kicks recording |
| Steve Cradock / OCS — Song of a Baker | Leslie cabinet captured by two SM57s at the rotating tweeter | 85 / 84; 1996 live-tour context |
| Noel Gallagher / Oasis — Take Me Away | Acoustic-slide overdub routed through Roland Space Echo | 94; original studio recording |
| Oasis — Supersonic | Slight detuning between lead takes, close/distant capture, opposed stereo ambience and pick scrape | 91–96; original studio recording |
| Oasis — Champagne Supernova | Noel's two E-Bow parts; Weller's white SG, old AC30 and SM57 capture | 93 / 94; original studio recording, distinct performers |

The Weller detail comes from mixer Jan Kybert's named-track notes. His account distinguishes source processing from subsequent mix decisions. The original Sound On Sound page was unavailable directly; its full reproduction was inspected. The Monotron must not be relabeled as Weller's unidentified pedal on the later Saturns Pattern. The Bomb Factory plug-in is not established as the reversal mechanism. [Kybert interview reproduction](https://nolimitsoundproductions.blogspot.com/2015/05/jan-stan-kybert-producing-paul-wellers.html).

The Cradock report is contemporary touring coverage. Its indexed text links the Leslie to the cover and specifies microphone placement. The PDF was unavailable directly. These assertions remain on the artist with explicit live context because no exact recorded performance was identified; they do not attach to a studio master. [Lighting + Sound International, December 1996](https://ftp.plasa.org/downloads/magazine-vault-issues/lsi-issue132.pdf).

Engineer Dave Scott directly describes the early Oasis sessions. Supersonic's stereo placement is not backwards audio, and its detuned layering does not establish a chorus pedal. Vocal and drum processors from the same interview were excluded from guitar claims. Space Echo model and settings remain unknown. [Scott correspondence](https://www.oasis-recordinginfo.co.uk/oasis-at-the-pink-museum-and-monnow-valley.html).

The E-Bow claim initially arrived labeled Wonderwall. The full indexed primary interview places it under **Champagne Supernova**. That identity was corrected before persistence. Weller's lead session, described in the same section, used no pedals and an AC30 volume setting of 3. Guitar, amplifier and microphone are separate reusable factors, with performer attribution in each claim. [Owen Morris interview, Champagne Supernova section](https://www.soundonsound.com/techniques/classic-tracks-oasis-wonderwall).

## What this adds to exploration

The useful comparison is between sustained guitar layers, physical rotary movement, detuned performances and reversed/edited audio. These are candidate explanations of texture, not measured acoustic equivalence or established reasons for Nick's preferences. The same equipment can serve different musical roles. Artist and album links guide exploration; a recording-specific claim applies only to its stated version and part.

The preceding [signal-chain comparison](2026-10-19-signal-chain-comparison.md) also saved the EMS-processed slide part on Put Yer Money Where Yer Mouth Is and reverse editing on Who Feels Love?. Those existing claims are reused in the interactive comparison. No exact chorus, phaser or flanger model on a new named studio recording was established in this pass. Cradock's generic later pedalboard remains separate from his 1996 live sound.

## Saved state and verification

The main shared-development transaction committed at `2026-10-19T09:39:01.799Z`: **83 entities and 127 relationships**, including **15 new confidence-scored assertions** (13 direct-recording, 2 artist-context). Scores range from 84 to 96. Existing Leslie and AC30 factors were reused. Six bounded MusicBrainz response records supported identities and catalog structure, including one reused from the prior local research cache. Original Sonik Kicks CD tracks and the 1995 Morning Glory CD establish the chosen Weller and Champagne Supernova recording versions.

Independent bounded readback verified 53 catalog/factor nodes, 82 catalog relationships and all 15 assertions with revision 1 and initial confidence history. An idempotent replay returned the existing receipt without repeating writes. Provider evidence used 26,364 compressed bytes in the existing private Azure evidence container. No listening-history writes, full database download, bulk import, collector restart or billing change occurred.

Private operational files are under `output/research/2026-10-19-guitar-effects/`: `final-review.json`, `claims.json`, `factor-identities.json`, `source-texts.json`, `main-persistence-receipt.json`, `main-readback.json` and `evidence-archive/`. The packet remains ignored under the existing research convention. Preserve this eleventh research delta, plus the ten earlier deltas, in the next bulk catalog/CAS baseline. This is separate from the stopped background collector and pending final catalog import.

Recheck the committed batch without repeating writes:

```powershell
node --env-file=.env output/research/2026-10-19-guitar-effects/persist.cjs
```

The conversation comparison now has an effects-to-recordings view alongside the signal-chain comparison. It presents saved claims with source, confidence and scope; it does not create a new app view or an ordered signal-chain schema. The app's existing Discovery view exposes the persisted evidence. No runtime code or schema changed.

Deployed Browse/Load and fullscreen inspection retrieved Champagne Supernova with 29 nodes / 42 connections and showed the saved E-Bow assertion at 93/100, direct scope and its primary source. Proof: `output/research/2026-10-19-guitar-effects/deployed-champagne-ebow.png`. The interactive comparison exposes 39 selectable stage/effect controls; both view selections restored after reload, and narrow content measured 345px without horizontal overflow. Browser proof and desktop/narrow images are beside the receipt.
