# MusicMesh — captured-audio analysis and research connections

19 September 2026. Status: computational audio pass and documentary follow-up completed; firsthand listening and final identification of sections B/C remain pending.

## The result

The three captured sections do not share one frequency balance, dynamic envelope or stereo profile. That makes this a useful exploration pilot, but not evidence of a single production recipe behind Nick's taste. The strongest documentary paths go through **recording method, a specific contributor and a particular repertoire choice**, not simply an artist's genre.

Important limitation: this session can measure local audio but does not provide direct auditory access to the assistant. Nothing below is presented as firsthand listening. There are no claimed identifications of instruments, effects, vocal layers, chord changes or studio equipment from hearing the capture. Computational evidence supplements rather than substitutes for that missing layer.

The Exa research skill guided primary-source checking and scope distinctions. The verification skill guided fresh measurements, synthetic checks, independent FFmpeg comparisons and preservation of the original recording. No application or database changes were made; no captured audio was uploaded to a remote service.

## Recording identity and boundaries

All timestamps below refer to the continuous recording, not commercial track positions.

| Section | Approximate location | Identity evidence | Current status |
|---|---|---|---|
| A | Music begins around 0:18; fades toward the background by 4:17 | A local 10-ms energy-envelope comparison finds the earlier user-confirmed Heavy Heavy test excerpt at 0:24.29, correlation 0.958; best matches in B/C are only 0.387/0.399 | Strong support for Miles and Miles; exact edit/master still unresolved |
| B | Starts around 4:23.85; user-selected musical endpoint 6:46 | Its roughly 2:22 musical portion and subsequent user-reported spoken tail are consistent with Running Around's 2:34 catalog duration | Probably Childish Gambino, not yet confirmed by the user or a catalog fingerprint |
| C | Starts around 6:57.2; fades around 11:13–11:17 | Roughly 4:20 is consistent with In the Living Room's published duration | Probably Maggie Rogers, not yet confirmed by the user or a catalog fingerprint |

The likely actual order is **Heavy Heavy → Gambino → Rogers**, differing from the original plan. A confirmation question has been sent. B/C labels must remain provisional until answered. The envelope correlation is a similarity statistic, not a 95.8% probability or proof of an ISRC/master. A's roughly four-minute extent also argues against assuming the intended shorter single edit was what played.

The user explicitly asked to stop B at ten seconds into the excerpt beginning at source 6:36. The exported `captures/segment-02-before-spoken-tail.wav` therefore contains source 4:20–6:46, including a short quiet lead-in. Later audio remains preserved in both continuous recordings. The spoken outro is excluded from the comparison, not treated as evidence that the user dislikes Gambino's music.

## Measured comparison

Source: [audio-measurements.json](audio-measurements.json). Analysis windows are A **0:20–4:00**, B **4:24–6:45**, C **7:00–11:12**. These omit boundary silence and B's spoken tail. A retains part of its long musical fade; these are not identically structured excerpts or certified whole-master measurements.

| Capture measurement | A: Heavy Heavy | B: probably Gambino | C: probably Rogers |
|---|---:|---:|---:|
| Power in 20–250 Hz, as share of 20 Hz–22.05 kHz | 34.9% | 80.7% | 54.2% |
| Sample crest factor: peak above average RMS | 12.6 dB | 10.8 dB | 9.2 dB |
| Three-second RMS level spread, 90th minus 10th percentile | 4.9 dB | 8.2 dB | 4.3 dB |
| Whole-window side/mid power ratio | −8.8 dB | −11.8 dB | −8.2 dB |
| Side/mid power ratio in 250–2,000 Hz | −7.7 dB | −5.7 dB | −5.4 dB |

These percentages are unweighted electrical signal energy, not perceived bass loudness, instrument shares or a count of bass notes. Crest factor does not identify a compressor. The level-spread statistic is **not EBU loudness range (LRA)**. A less-negative side/mid ratio means more difference between the channels relative to shared content; it is not a complete perceptual width model.

### A — less low-frequency-dominated, more peak-to-body contrast

**Measurement:** A has much less low-frequency energy than B and C, and the largest sample crest factor. Its 250 Hz–6 kHz bands account for about 64.4% of measured power, versus 18.0% in B and 44.1% in C. A substantial level step occurs around source 0:34; a prolonged fade is visible late in the section.

**Inference:** relative to the other captures, the profile is more midrange-led and allows larger peaks above its average level. That is a useful comparison target for perceived attack and body. It is not proof that a drum is more natural, that the recording used tape, or that it is objectively more dynamic in every sense.

**Documented production context:** Turner and Fuller describe recording the EP in their London flat. Turner deliberately limited himself to eight tracks while using old and new equipment. His stated formative artists include Cream, Hendrix, the Stones and Creedence. This is evidence of process and reported influence, not an equipment inventory. [Original MAGNET interview](https://magnetmagazine.com/2022/10/06/a-conversation-with-the-heavy-heavy/).

**New technical lead:** in a later first-person interview, Turner describes Fuller's voice through a tube microphone, compression and tape as part of their early creative connection. That adds a real signal-chain category, but no microphone/compressor/tape-machine model or song-specific settings. The interview also distinguishes the home-recorded EP from the later Brighton studio album. Do not transfer that later album's rig into Miles and Miles. [Relix interview](https://relix.com/articles/detail/spotlight-the-heavy-heavy/).

**Best exploration route:** the band's recorded covers provide a concrete bridge: Heavy Heavy's Desert Raven → Jonathan Wilson's original; or their Guinnevere → Crosby, Stills & Nash. Compare the treatment of the same composition before expanding by broad genre. The label explicitly identifies those covers. [ATO expanded edition](https://atorecords.com/releases/the-heavy-heavy-life-and-life-only-expanded-edition/).

### B — strong low-frequency weighting and larger section-level changes

**Measurement:** B is the most low-frequency-weighted capture. Its level envelope changes more between quieter and stronger passages than A/C under the stated statistic. A clear higher-level passage runs around 4:49–5:12, with a sudden dip near 5:12; another sustained passage occurs around 5:56–6:20, followed by a lower-level ending before the user-selected cut.

**Inference:** a plausible listening question is whether the appeal comes from contrast and release between sections rather than from matching Heavy Heavy's tonal balance. The measurements alone do not establish verse/chorus labels, the instrument causing the lift, or whether a fader adjustment contributed. Nick's playback settings were not instrumented during the run.

**The stereo trap:** B's whole-window result looks more centered. But its 250–2,000 Hz and 2,000–6,000 Hz side/mid ratios are less negative than A's: more interchannel difference in those bands. Its large, mostly centered low-frequency component dominates the full-band number. “B has a narrower mix” would therefore be an overstatement.

**Documentary track investigation, independent of the provisional capture label:** Running Around credits Riley Mackin, Tyler Johnson and Emi Trevena on guitar, Aaron Steele on drums, and Willow Smith on background vocals. Producer credits include Glover, Michael Uzowuru, Mackin, Johnson and Smith; Stuart White mixed and Colin Leonard mastered. Three credited guitarists do not establish three simultaneous guitar layers or who played a particular part. [Qobuz track 14](https://www.qobuz.com/ca-en/album/bando-stone-and-the-new-world-childish-gambino/buzikcn8shlqb).

**Best exploration route:** Running Around → Aaron Steele → a specific comparison from his own portfolio, such as Hayley Williams' Simmer. His portfolio also lists Portugal. The Man, Leon Bridges and José James. Treat these as contributor-led candidates, not a promise of similar sound; confirm the comparison track's detailed credit before making a precise part-level claim. His advertised hardware brands are not evidence of this song's drum setup. [Steele's own portfolio](https://network.landr.com/users/aaron-gilbert-steele).

### C — a sustained high-level body after an opening build

**Measurement:** C has the smallest peak-to-average difference. The level rises in stages around 7:28 and 7:48, then remains fairly consistent for much of the remainder, with short dips near 8:19–8:24 and 10:02–10:06. This is a signal-level description, not a heard description of the arrangement.

**Inference:** compared with B, C's envelope suggests a build into a more sustained body rather than repeated large level resets. That is a testable listening contrast. It does not by itself prove heavier bus compression, brickwall limiting, more instruments or a particular mastering style.

**Documented credits:** Rogers' own release announcement credits herself and Ian Fitchuk as writers/producers, Konrad Snyder for engineering, Fitchuk and Sam Evian for instrumentation, Jonathan Low for mixing and Emily Lazar for mastering. The label dates the writing to March 2023. Neither establishes the exact studio room or Evian's gear on this single. [Artist's credits](https://www.instagram.com/reel/DA3wAGpPb9G/?hl=en), [label announcement](https://www.universalmusic.ca/2024/10/08/maggie-rogers-unveils-new-single-in-the-living-room-today/).

**Best technical exploration route:** In the Living Room → credited contributor Sam Evian → his album Plunge. Evian describes recording on a Tascam 48 eight-track, transferring to an MCI 16-track, and working with musicians together, without headphones or a click. His named guitar chain includes a Warmoth-based build with Lollar gold foils, Cali76, Tumnus, Warped Vinyl, Magnatone Twilighter, Beyerdynamic M 160 and a Neve preamp. The article does not identify the MCI/Neve models or establish a universal pedal order/settings. These are **Plunge facts, not Maggie Rogers' rig**. A candidate comparison is Why Does It Take So Long?; it has not been auditioned here. [Evian's first-person interview](https://www.guitarplayer.com/players/sam-evian-plunge).

## What genuinely connects

The strongest cross-branch production hypothesis is **committing to a limited recording setup**: Turner's EP-era eight-track constraint and Evian's documented eight-/sixteen-track process. The documented relationship is Maggie's recording → Evian; the comparison to Heavy Heavy is a method-based inference. There is no established shared tape machine, console, producer, studio or direct influence between these recordings.

“Band / female solo artist / male solo artist” was useful for choosing varied examples, but does not describe how the records were built. A band-branded EP can emerge from an intimate home-recording partnership; a solo-billed song can have three guitarists and several producers. Contributors and parts are the more useful exploration units.

For Nick's taste, the next comparison should isolate one question at a time:

- **Heavy Heavy:** is the attraction mainly to the vocal/ensemble treatment, midrange balance, pulse, or the song itself? A cover/original comparison controls the composition more closely.
- **Gambino candidate:** do the large changes between sections work, while the spoken tail does not? Those are two separate preferences, not conflicting ratings.
- **Rogers candidate:** does the sustained body work as well as the opening build? A participant-led comparison tests a contributor connection without presuming an artist-wide preference.

Those are proposed listening questions, not observations that the user has already confirmed. No preference score has been invented from these measurements.

## What this pass cannot establish

- Key, chord progression, harmonic rhythm, meter, intentional swing, microtiming, vocal doubling, instrument entry times and specific effects remain unverified.
- The onset analysis finds periodicities near 146/74 for A, 154/78 for B and 188/125/63 for C. These are competing rhythmic periods, not certified BPM labels. Subdivision and half-/double-time ambiguity prevent promoting the strongest numerical peak directly to musical tempo.
- Finished stereo audio cannot uniquely identify a guitar model, amp, mic, console or signal chain. None has been guessed.
- A/C and B differ in analysis duration and structure. Interior 60-second sensitivity checks retain the crest-factor ordering (A 12.2, B 10.1, C 9.2 dB) and B's larger level spread (A 2.2, B 5.9, C 1.4 dB). These checks are not statistical confidence intervals or full validation across every passage.
- A quiet opening region measures roughly −45.7 dBFS RMS and is almost identical in both channels. Its cause is not established. Do not attribute it to tape hiss or any artist's production. It limits conclusions about very quiet tails.
- No full-scale samples were found in the measured musical regions. This does not rule out clipping upstream, intersample peaks or distortion already in the recording.
- Roon DSP, volume leveling, mixer gain/EQ and any changes during playback were not logged. Absolute levels are not original-master loudness. Fractional spectral balance and peak/RMS ratios are insensitive to uniform gain, but not to EQ, dynamics or time-varying gain.
- Forced capture termination required finalizing a separate WAV. Every complete captured PCM frame was preserved; only a two-byte incomplete final frame fragment was dropped. Original source completeness remains distinct from file integrity.

## Evidence and reproducibility

- `audio-measurements.json`: metrics, exact source windows, source hashes, reference match and sensitivity checks.
- `analyze_capture.py`: read-only NumPy analysis; contains synthetic amplitude/stereo/pulse tests. Frequency analysis uses 2,048-sample Hann windows with a 441-sample hop at 44.1 kHz, combining left/right spectral power without mono folding. Rhythm candidates use positive log-spectral flux autocorrelation and remain provisional.
- `audio-research-followup.json`: scope of this turn's searches and documentary source records.
- `captures/three-track-continuous-20260919-164312-verification.json`: original/finalized hashes, capture-stop limitation and user-directed edit.

The analysis script's self-tests passed. Independent FFmpeg astats measurements agreed on each region's peak and RMS to within 0.001 dB, and sample counts matched. The original and finalized WAV hashes were checked against the saved verification record.

Reproduce the measurements from PowerShell:

```powershell
& 'C:\Users\NickKatsivelos\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' 'D:\Studio13\Lab\Code\MusicMesh\exa-results\three-track-pilot-2026-09-19\analyze_capture.py'
```

The follow-up used three searches requesting 15 result slots and fetched nine distinct pages. Search-result slots are not independent sources read. Earlier documentary work remains in `report.md` and `evidence.json`; this file updates the audio-access status without turning inferred links into canonical facts.
