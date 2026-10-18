# MusicMesh Browse (optional Roon extension)

Local operator tooling, separate from application startup/Azure. Uses pinned official Roon SDKs. Requests only the browse service. This service can expose action items; this implementation only follows explicit navigation-list items and never supplies a playback zone. Default mode loads at most 20 genre-root items after authorization. No transport service, database writes or audio downloads are implemented here.

From the MusicMesh root:

```powershell
npm ci --prefix tools/roon-browse --ignore-scripts
node tools/roon-browse/index.cjs <Core-host> 9330
# Optional explicit capability tests (stop the existing owned instance first):
node tools/roon-browse/index.cjs <Core-host> 9330 --inspect
node tools/roon-browse/index.cjs <Core-host> 9330 --ten-albums
```

Keep the process running. In Roon connected to the desired Server/Core, open **Settings > Extensions**, find **MusicMesh Browse** by **Studio13**, and click **Enable**. Some Roon layouts place Extensions under Settings > Setup. Roon authorization is required by the provider; no password needs to be shared with MusicMesh.

Private files under ignored `output/roon-browse/`:

- `authorization.json`: SDK tokens; never print, commit or share.
- `status.json`: process ID, connection/authorization state and last update.
- `genre-root.json`: bounded initial capability response, only after enablement.
- `capability-inspection.json`: small navigation inspection from `--inspect`.
- `ten-album-test.json`: complete/failed receipt, selected candidates, display responses, genre memberships and limits from `--ten-albums`.
- `album-inventory.json`: private title/artist navigation list used to select candidates.
- `extension.log` / `extension.error.log`: when launched with redirected output.

Check status and the recorded PID before launching another instance. Stop the owned process with Ctrl+C when interactive, or `Stop-Process -Id <verified-extension-PID>` when started hidden. This is not an installed Windows service and does not automatically launch at login. A ready genre root is not proof that the ten-album test is complete; check its receipt. A probe runs once per process, not again on automatic reconnection.

The ten-album mode reads local `output/imports/2026-10-17/prepared/events.ndjson`, not Neon. It chooses ten highest-play-count exact album-title/artist-text candidates, one per artist string, excluding duplicate Roon candidates. It caps each list at 2,000 items, the run at 240 browse/load requests, and individual requests at 15 seconds. It reads all top-level genre memberships and three selected Pop/Rock branches. Results are observed browser membership, not exhaustive direct genre assignments; title matches do not verify editions. It never opens action/action-list track entries. Inspect the completed receipt for truncation/failure before drawing conclusions.

Verified 18 October: 225 requests, ten complete album detail lists, 24 complete genre membership lists, all ten candidates found in at least one genre. All 21 root navigation keys changed after resetting the browse stack. Observed album items contain title/subtitle/image/navigation/hint fields, without typed personnel roles or external catalog IDs. Album/genre snapshots remain private local evidence, not imported graph facts.

Connection receipt and exact current Core address are private under `output/roon-probe/`. Authorization tokens survive a normal restart. A connection refusal before a WebSocket opens is reported as `connection-error`; correct the host/network and restart rather than assuming authorization succeeded.
