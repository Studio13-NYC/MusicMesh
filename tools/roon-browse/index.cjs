// Optional local operator extension. No database access or playback actions.
const fs = require('node:fs');
const path = require('node:path');
const RoonApi = require('node-roon-api');
const RoonApiBrowse = require('node-roon-api-browse');

const host = process.argv[2];
const port = Number(process.argv[3] || 9330);
if (!host || !Number.isInteger(port) || port < 1 || port > 65535) {
  console.error('Usage: node tools/roon-browse/index.cjs <Core host> [API port]');
  process.exit(1);
}
const directory = path.resolve(__dirname, '../../output/roon-browse');
fs.mkdirSync(directory, { recursive: true });
const statePath = path.join(directory, 'authorization.json');
const statusPath = path.join(directory, 'status.json');
let stopping = false;
let connection;
let retry;
let status = { pid: process.pid, host, port, extensionName: 'MusicMesh Browse', startedAt: new Date().toISOString() };
function update(state, details = {}) {
  status = { ...status, ...details, state, updatedAt: new Date().toISOString() };
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
  console.log(JSON.stringify({ at: status.updatedAt, state, ...details }));
}
const roon = new RoonApi({
  extension_id: 'nyc.s13.musicmesh.browse',
  display_name: 'MusicMesh Browse',
  display_version: '0.1.0',
  publisher: 'Studio13',
  email: 'nick@katsivelos.com',
  website: 'https://musicmesh.s13.nyc/',
  log_level: 'all',
  get_persisted_state() {
    if (!fs.existsSync(statePath)) return {};
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  },
  set_persisted_state(state) {
    // SDK authorization tokens remain in ignored local storage, never logs.
    fs.writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
  },
  core_found(core) {
    update('authorized', { coreName: core.display_name, coreVersion: core.display_version });
    const browse = core.services.RoonApiBrowse;
    if (!browse) return update('browse-unavailable');
    // A single bounded read proves access. No action item or playback zone is selected.
    browse.browse({ hierarchy: 'genres', pop_all: true }, (error, body) => {
      if (error) return update('genre-probe-failed', { error: String(error) });
      if (body.action !== 'list') return update('genre-probe-no-list', { action: body.action });
      browse.load({ hierarchy: 'genres', offset: 0, count: 20 }, (loadError, result) => {
        if (loadError) return update('genre-probe-failed', { error: String(loadError) });
        fs.writeFileSync(path.join(directory, 'genre-root.json'), JSON.stringify({ retrievedAt: new Date().toISOString(), coreName: core.display_name, ...result }, null, 2));
        update('ready', { genreRootItems: result.items.length, genreRootTotal: result.list?.count, tenAlbumTestComplete: false });
      });
    });
  },
  core_lost() { if (!stopping) update('disconnected'); },
});
// Inspect only SDK protocol status labels; never serialize protocol payloads/tokens.
// This logger shape is checked against the pinned official SDK revision.
roon.logger.log = (...args) => {
  if (args[0] === '<-') {
    if (args[3] === 'com.roonlabs.ping:1/ping') {
      if (status.state === 'registration-sent') update('awaiting-authorization');
      return;
    }
    console.log(JSON.stringify({ at: new Date().toISOString(), direction: 'received', message: args[3] }));
    if (args[3] === 'NotRegistered') update('waiting-for-enable');
  }
  if (args[0] === '-> REQUEST' && args[2] === 'com.roonlabs.registry:1/register') update('registration-sent');
};
roon.init_services({ required_services: [RoonApiBrowse] });
function connect() {
  if (stopping) return;
  update('connecting');
  connection = roon.ws_connect({
    host, port,
    onclose() {
      if (stopping) return;
      update('disconnected');
      clearTimeout(retry);
      retry = setTimeout(connect, 10000);
    },
    onerror() {
      if (!stopping) update('connection-error');
    },
  });
}
function stop() {
  stopping = true;
  clearTimeout(retry);
  connection?.transport.close();
  update('stopped');
  process.exit(0);
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
connect();
