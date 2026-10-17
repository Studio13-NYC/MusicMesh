"""Read-only, local capture measurements. No listening or instrument identification.

Run with bundled Python and NumPy. Outputs JSON to stdout; never edits input audio.
Regions omit boundary silence and the spoken outro; A retains part of its fade.
"""
import hashlib
import json
import math
import struct
import sys
from pathlib import Path

import numpy as np


def read_pcm(path):
    data = Path(path).read_bytes()
    assert data[:4] == b"RIFF" and data[8:12] == b"WAVE"
    pos = 12
    fmt = pcm = None
    while pos + 8 <= len(data):
        tag, size = struct.unpack_from("<4sI", data, pos)
        block = data[pos + 8:min(pos + 8 + size, len(data))]
        if tag == b"fmt ":
            fmt = struct.unpack_from("<HHIIHH", block)
        if tag == b"data":
            pcm = block
            break
        pos += 8 + size + size % 2
    encoding, channels, rate, _, _, bits = fmt
    assert encoding in (1, 65534) and channels == 2
    if bits == 16:
        samples = np.frombuffer(pcm, dtype="<i2").astype(np.float64) / 32768
    elif bits == 24:
        q = np.frombuffer(pcm, dtype=np.uint8).reshape(-1, 3).astype(np.int32)
        v = q[:, 0] | (q[:, 1] << 8) | (q[:, 2] << 16)
        v = (v ^ 8388608) - 8388608
        samples = v.astype(np.float64) / 8388608
    else:
        raise ValueError(bits)
    return samples.reshape(-1, channels), rate, hashlib.sha256(data).hexdigest()


def db(value):
    return float(20 * np.log10(max(float(value), 1e-15)))


def energy_envelope(x, rate, seconds=0.01):
    n = round(rate * seconds)
    a = x[:len(x) // n * n].reshape(-1, n, 2)
    return np.sqrt(np.mean(a * a, axis=(1, 2)))


def rhythm_candidates(onsets, fps):
    z = onsets - np.mean(onsets)
    n = 1 << (2 * len(z) - 1).bit_length()
    f = np.fft.rfft(z, n)
    ac = np.fft.irfft(f * f.conj(), n)[:len(z)]
    if ac[0] <= 0:
        return []
    ac /= ac[0]
    low, high = math.ceil(60 * fps / 200), math.floor(60 * fps / 50)
    peaks = [i for i in range(low, min(high, len(ac) - 2))
             if ac[i] >= ac[i - 1] and ac[i] > ac[i + 1]]
    peaks.sort(key=lambda i: float(ac[i]), reverse=True)
    return [{"bpm_periodicity": round(60 * fps / i, 2),
             "autocorrelation": round(float(ac[i]), 4)} for i in peaks[:6]]


def spectrum_and_onsets(x, rate):
    nfft, hop = 2048, 441
    frequencies = np.fft.rfftfreq(nfft, 1 / rate)
    window = np.hanning(nfft)
    frames = np.lib.stride_tricks.sliding_window_view(x, nfft, axis=0)[::hop]
    # Shape is frames, stereo channels, samples; sum channel power, do not mono-fold.
    power_sum = np.zeros(nfft // 2 + 1)
    mid_sum = np.zeros(nfft // 2 + 1)
    side_sum = np.zeros(nfft // 2 + 1)
    flux, centers = [], []
    previous = None
    for offset in range(0, len(frames), 256):
        spec = np.fft.rfft(frames[offset:offset + 256] * window, axis=2)
        power = np.mean(np.abs(spec) ** 2, axis=1)
        power_sum += power.sum(axis=0)
        mid_sum += (np.abs((spec[:, 0] + spec[:, 1]) / 2) ** 2).sum(axis=0)
        side_sum += (np.abs((spec[:, 0] - spec[:, 1]) / 2) ** 2).sum(axis=0)
        magnitude = np.sqrt(power)
        centers.extend((magnitude @ frequencies / np.maximum(magnitude.sum(axis=1), 1e-15)).tolist())
        logmag = np.log1p(100 * magnitude[:, (frequencies >= 80) & (frequencies <= 10000)])
        prior = np.vstack([logmag[0] if previous is None else previous, logmag[:-1]])
        flux.extend(np.maximum(logmag - prior, 0).mean(axis=1).tolist())
        previous = logmag[-1]
    edges = [(20, 80), (80, 250), (250, 2000), (2000, 6000), (6000, 12000), (12000, 22050)]
    total = power_sum[(frequencies >= 20) & (frequencies <= 22050)].sum()
    bands = {f"{lo}-{hi}": round(float(power_sum[(frequencies >= lo) & (frequencies < hi)].sum() / total * 100), 3)
             for lo, hi in edges}
    return {
        "power_band_percent_hz": bands,
        "side_to_mid_power_db_by_band_hz": {
            f"{lo}-{hi}": round(float(10 * np.log10(side_sum[(frequencies >= lo) & (frequencies < hi)].sum()
                                                       / mid_sum[(frequencies >= lo) & (frequencies < hi)].sum())), 3)
            for lo, hi in [(20, 250), (250, 2000), (2000, 6000), (6000, 12000)]},
        "median_magnitude_spectral_centroid_hz": round(float(np.median(centers)), 1),
        "rhythmic_periodicity_candidates_not_verified_tempo": rhythm_candidates(np.array(flux), rate / hop),
        "rhythm_windows": [{"offset_seconds": start,
                            "candidates": rhythm_candidates(np.array(flux)[start * 100:(start + 30) * 100], 100)}
                           for start in range(0, max(0, int(len(x) / rate) - 29), 30)],
    }


def basic(x, rate):
    rms = np.sqrt(np.mean(x * x))
    peak = np.max(np.abs(x))
    l, r = x[:, 0], x[:, 1]
    mid, side = (l + r) / 2, (l - r) / 2
    three = energy_envelope(x, rate, 3)
    one = energy_envelope(x, rate, 1)
    p10, p50, p90 = 20 * np.log10(np.percentile(three, [10, 50, 90]))
    return {
        "duration_seconds": len(x) / rate,
        "sample_peak_dbfs": round(db(peak), 3),
        "rms_dbfs": round(db(rms), 3),
        "sample_crest_factor_db": round(db(peak) - db(rms), 3),
        "full_scale_sample_count": int(np.sum(np.abs(x) >= 32767 / 32768)),
        "dc_mean": np.mean(x, axis=0).tolist(),
        "lr_pearson_correlation": round(float(np.corrcoef(l, r)[0, 1]), 4),
        "side_to_mid_power_db": round(10 * float(np.log10(np.mean(side * side) / np.mean(mid * mid))), 3),
        "three_second_rms_dbfs_p10_p50_p90": [round(float(v), 3) for v in (p10, p50, p90)],
        "three_second_rms_p90_minus_p10_db_not_lra": round(float(p90 - p10), 3),
        "one_second_rms_dbfs": np.round(20 * np.log10(np.maximum(one, 1e-15)), 3).tolist(),
    }


def match_reference(x, ref, rate):
    # Compare gain-independent 10-ms RMS envelopes; not a catalog fingerprint.
    # Per-region comparison identifies whether the confirmed test passage recurs.
    q = energy_envelope(ref, rate)
    q -= q.mean()
    rows = []
    for name, start, end in [("A", 0, 260), ("B", 260, 406), ("C", 417.2, 679)]:
        a = energy_envelope(x[round(start * rate):round(end * rate)], rate)
        m = len(q)
        n = 1 << (len(a) + m - 1).bit_length()
        cross = np.fft.irfft(np.fft.rfft(a, n) * np.fft.rfft(q[::-1], n), n)[m-1:len(a)]
        cs = np.r_[0, np.cumsum(a)]
        css = np.r_[0, np.cumsum(a*a)]
        sums = cs[m:] - cs[:-m]
        variance = np.maximum(css[m:] - css[:-m] - sums*sums/m, 1e-15)
        corr = cross / np.sqrt(variance * np.sum(q*q))
        k = int(np.argmax(corr))
        rows.append({"region": name, "match_start_seconds_in_capture": round(start + k * 0.01, 2),
                     "envelope_correlation": round(float(corr[k]), 5)})
    return rows


def self_test():
    fs = 44100
    t = np.arange(fs * 6) / fs
    mono = 0.5 * np.sin(2 * np.pi * 1000 * t)
    stats = basic(np.column_stack([mono, mono * 0.5]), fs)
    assert abs(stats["sample_peak_dbfs"] + 6.02) < 0.01
    assert stats["lr_pearson_correlation"] == 1
    assert abs(stats["side_to_mid_power_db"] - 20 * np.log10(1/3)) < 0.01
    onset = np.zeros(3000)
    onset[::50] = 1
    assert abs(rhythm_candidates(onset, 100)[0]["bpm_periodicity"] - 120) < 0.01
    test = np.random.default_rng(10).normal(0, 0.1, (fs * 40, 2))
    # Validate envelope correlation separately without region matching assumptions.
    env = energy_envelope(test, fs)
    assert len(env) == 4000
    print("measurement self-tests passed", file=sys.stderr)


if __name__ == "__main__":
    self_test()
    folder = Path(__file__).parent / "captures"
    audio, rate, sha = read_pcm(folder / "three-track-continuous-20260919-164312-finalized.wav")
    reference, ref_rate, ref_sha = read_pcm(folder / "main-mix-test-20260919-162938.wav")
    assert rate == ref_rate == 44100
    result = {
        "scope": "Computational measurements of a playback-chain capture, not firsthand listening or original-master measurements.",
        "source_sha256": sha,
        "sample_rate_hz": rate,
        "reference_test_sha256": ref_sha,
        "reference_envelope_match": match_reference(audio, reference, rate),
        "regions": [],
        "noise_region": {"start_seconds": 0, "end_seconds": 15, **basic(audio[:15*rate], rate)},
    }
    for name, start, end in [("A", 20, 240), ("B", 264, 405), ("C", 420, 672)]:
        x = audio[round(start*rate):round(end*rate)]
        result["regions"].append({"id": name, "start_seconds": start, "end_seconds": end,
                                  **basic(x, rate), **spectrum_and_onsets(x, rate)})
    result["interior_60_second_sensitivity_windows"] = [
        {"region": name, "start_seconds": start, "end_seconds": start + 60,
         **basic(audio[start*rate:(start+60)*rate], rate)}
        for name, start in [("A", 80), ("B", 300), ("C", 477)]]
    print(json.dumps(result, indent=2, allow_nan=False))
