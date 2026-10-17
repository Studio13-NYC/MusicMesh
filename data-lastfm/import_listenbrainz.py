"""Import this Last.fm CSV through ListenBrainz's documented bulk API.

Prepare: python data-lastfm/import_listenbrainz.py
Submit:  python data-lastfm/import_listenbrainz.py --submit
Submit reads the existing ListenBrainz user token from stdin; never stores it.
Uses a local receipt to resume acknowledged batches. Stops on ambiguous failures.
"""
import argparse
import csv
import hashlib
import json
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "recenttracks-bobdobbsnyc-1792084706.csv"
RECEIPT = ROOT / "listenbrainz-import-receipt.json"
PAYLOAD = ROOT / "listenbrainz-listens.json"
API = "https://api.listenbrainz.org/1"
USER = "nickknyc"
UA = "MusicMeshHistoryImport/1.0 (https://musicmesh.s13.nyc/)"


def prepare():
    rows = list(csv.DictReader(SOURCE.open(encoding="utf-8-sig", newline="")))
    listens, seen = [], set()
    for row in rows:
        ts = int(row["uts"])
        artist, track = row["artist"], row["track"]
        assert artist and track and 1033430400 <= ts <= int(time.time())
        key = (ts, artist, track)
        assert key not in seen, "Duplicate source listen; review before import"
        seen.add(key)
        info = {"submission_client": "MusicMeshHistoryImport",
                "submission_client_version": "1.0",
                "original_submission_client": "Last.fm"}
        # Preserve source IDs without guessing whether Last.fm's IDs represent
        # recordings, release tracks, releases or release groups. Allow LB's mapper
        # to resolve canonical IDs from the original artist/track/album names.
        for field in ("artist_mbid", "album_mbid", "track_mbid"):
            if row[field]:
                info["lastfm_" + field] = row[field]
        meta = {"artist_name": artist, "track_name": track, "additional_info": info}
        if row["album"]:
            meta["release_name"] = row["album"]
        listen = {"listened_at": ts, "track_metadata": meta}
        assert len(json.dumps(listen).encode()) < 10240
        listens.append(listen)
    listens.sort(key=lambda x: x["listened_at"])
    PAYLOAD.write_text(json.dumps(listens, ensure_ascii=False), encoding="utf-8")
    return listens


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--submit", action="store_true")
    parser.add_argument("--verify", action="store_true", help="Read-only API verification, no token needed")
    parser.add_argument("--max-batches", type=int)
    args = parser.parse_args()
    listens = prepare()
    source_hash = hashlib.sha256(SOURCE.read_bytes()).hexdigest()
    print(json.dumps({"source_rows": len(listens), "source_sha256": source_hash,
                      "oldest": listens[0]["listened_at"],
                      "newest": listens[-1]["listened_at"]}), flush=True)
    if not args.submit and not args.verify:
        return
    token = sys.stdin.readline().strip() if args.submit else None
    if args.submit and not token:
        raise RuntimeError("No token supplied on stdin")
    last_request = 0

    def request(path, data=None):
        nonlocal last_request
        time.sleep(max(0, 1.1 - (time.monotonic() - last_request)))
        headers = {"User-Agent": UA}
        if token:
            headers["Authorization"] = "Token " + token
        body = None
        if data is not None:
            body = json.dumps(data, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        req = urllib.request.Request(API + path, data=body, headers=headers)
        last_request = time.monotonic()
        with urllib.request.urlopen(req, timeout=60) as response:
            result = json.load(response)
            if int(response.headers.get("X-RateLimit-Remaining", "1")) == 0:
                time.sleep(float(response.headers.get("X-RateLimit-Reset-In", "2")) + 1)
            return result

    if args.submit:
        auth = request("/validate-token")
        assert auth.get("valid") and auth.get("user_name") == USER, "Token account mismatch"
    count = request(f"/user/{USER}/listen-count")["payload"]["count"]
    if RECEIPT.exists():
        receipt = json.loads(RECEIPT.read_text(encoding="utf-8"))
        assert receipt["source_sha256"] == source_hash and receipt["user"] == USER
        assert not receipt.get("pending_batch"), "Uncertain prior batch: reconcile before retry"
    else:
        assert args.submit, "No import receipt exists to verify"
        assert count == 0, "Account already contains listens: reconcile before import"
        receipt = {"user": USER, "source_sha256": source_hash,
                   "source_rows": len(listens), "initial_count": count,
                   "accepted_rows": 0, "batches": []}

    def save():
        RECEIPT.write_text(json.dumps(receipt, indent=2), encoding="utf-8")

    batches_this_run = 0
    for offset in range(receipt["accepted_rows"], len(listens), 1000) if args.submit else []:
        batch = listens[offset:offset + 1000]
        receipt["pending_batch"] = {"offset": offset, "rows": len(batch)}
        save()
        result = request("/submit-listens", {"listen_type": "import", "payload": batch})
        assert result.get("status") == "ok", "Unexpected submission response"
        receipt["batches"].append({"offset": offset, "rows": len(batch), "response": result})
        receipt["accepted_rows"] = offset + len(batch)
        receipt.pop("pending_batch")
        save()
        print(json.dumps({"accepted_rows": receipt["accepted_rows"], "total": len(listens)}), flush=True)
        batches_this_run += 1
        if args.max_batches and batches_this_run >= args.max_batches:
            break
    receipt["verified_count"] = request(f"/user/{USER}/listen-count")["payload"]["count"]
    samples = []
    accepted = receipt["accepted_rows"]
    for index in sorted(set([0, accepted // 2, accepted - 1])):
        expected = listens[index]
        ts = expected["listened_at"]
        result = request(f"/user/{USER}/listens?max_ts={ts + 1}&count=10")
        matches = [x for x in result["payload"]["listens"]
                   if x["listened_at"] == ts
                   and x["track_metadata"]["artist_name"] == expected["track_metadata"]["artist_name"]
                   and x["track_metadata"]["track_name"] == expected["track_metadata"]["track_name"]]
        samples.append({"index": index, "listened_at": ts, "matched": bool(matches)})
    receipt["sample_checks"] = samples
    receipt["complete"] = (accepted == len(listens)
                           and receipt["verified_count"] == len(listens)
                           and all(x["matched"] for x in samples))
    save()
    print(json.dumps({"verified_count": receipt["verified_count"],
                      "sample_checks": samples, "complete": receipt["complete"]}), flush=True)


if __name__ == "__main__":
    main()
