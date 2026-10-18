# MusicMesh Browse (optional Roon extension)

Local operator tooling, separate from application startup/Azure. Uses pinned official Roon SDKs. Requests only the browse service. This service can expose action items; this implementation only opens the genre root and loads at most 20 items after authorization. It never selects action items or supplies a playback zone. No transport service, database writes, audio downloads or ten-album import is implemented here.

From the MusicMesh root:

```powershell
npm ci --prefix tools/roon-browse --ignore-scripts
node tools/roon-browse/index.cjs <Core-host> 9330
```

Keep the process running. In Roon connected to the desired Server/Core, open **Settings > Extensions**, find **MusicMesh Browse** by **Studio13**, and click **Enable**. Some Roon layouts place Extensions under Settings > Setup. Roon authorization is required by the provider; no password needs to be shared with MusicMesh.

Private files under ignored `output/roon-browse/`:

- `authorization.json`: SDK tokens; never print, commit or share.
- `status.json`: process ID, connection/authorization state and last update.
- `genre-root.json`: bounded initial capability response, only after enablement.
- `extension.log` / `extension.error.log`: when launched with redirected output.

Check status and the recorded PID before launching another instance. Stop the owned process with Ctrl+C when interactive, or `Stop-Process -Id <verified-extension-PID>` when started hidden. This is not an installed Windows service and does not automatically launch at login. A ready genre root is not proof that the ten-album test is complete. The next test must verify navigation, edition mapping and genre scope without selecting playback actions.

Connection receipt and exact current Core address are private under `output/roon-probe/`. Authorization tokens survive a normal restart. A connection refusal before a WebSocket opens is reported as `connection-error`; correct the host/network and restart rather than assuming authorization succeeded.
