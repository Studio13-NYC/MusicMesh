const fs = require('node:fs');
const path = require('node:path');
async function inspect(browse, directory) {
  let requests = 0;
  const session = 'musicmesh-validation';
  const call = (method, options) => new Promise((resolve, reject) => {
    if (++requests > 100) return reject(new Error('Probe request limit reached'));
    const timer = setTimeout(() => reject(new Error('Roon request timed out')), 15000);
    browse[method]({ ...options, multi_session_key: session }, (error, result) => {
      clearTimeout(timer);
      if (error) reject(new Error(String(error))); else resolve(result);
    });
  });
  async function list(hierarchy, options = {}, count = 30) {
    const navigation = await call('browse', { hierarchy, ...options });
    if (navigation.action !== 'list') return { navigation };
    return { navigation, ...await call('load', { hierarchy, count, offset: 0 }) };
  }
  const genres = await list('genres', { pop_all: true });
  const genre = genres.items?.find(item => item.title === 'Pop/Rock' && item.hint === 'list');
  const genreDetail = genre ? await list('genres', { item_key: genre.item_key }) : null;
  const albums = await list('albums', { pop_all: true });
  const album = albums.items?.find(item => item.hint === 'list' && !item.input_prompt);
  const albumDetail = album ? await list('albums', { item_key: album.item_key }) : null;
  const result = { retrievedAt: new Date().toISOString(), requests, genres, genreDetail, albums, albumDetail };
  fs.writeFileSync(path.join(directory, 'capability-inspection.json'), JSON.stringify(result, null, 2));
  return { requests, inspected: true };
}
module.exports = { inspect };

// Candidate matching is deliberately exact after lexical normalization. It does
// not establish recording/edition identity and never writes provider assertions.
const normalize = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase('en-US');
const identity = (title, artist) => JSON.stringify([normalize(title), normalize(artist)]);
async function tenAlbums(browse, directory) {
  const readline = require('node:readline');
  const history = new Map();
  const sourcePath = path.resolve(__dirname, '../../output/imports/2026-10-17/prepared/events.ndjson');
  for await (const line of readline.createInterface({ input: fs.createReadStream(sourcePath), crlfDelay: Infinity })) {
    const p = JSON.parse(line).properties;
    if (!p.submittedAlbum || !p.submittedArtist) continue;
    const key = identity(p.submittedAlbum, p.submittedArtist);
    const entry = history.get(key) || { title: p.submittedAlbum, artist: p.submittedArtist, plays: 0, tracks: new Set() };
    entry.plays++;
    entry.tracks.add(p.submittedTitle);
    history.set(key, entry);
  }
  let requests = 0;
  const report = { startedAt: new Date().toISOString(), state: 'running', sourcePath, requests: 0, albumTests: [], genreTests: [], limitations: [] };
  const save = () => {
    report.requests = requests;
    fs.writeFileSync(path.join(directory, 'ten-album-test.json'), JSON.stringify(report, null, 2));
  };
  const call = (method, options) => new Promise((resolve, reject) => {
    if (++requests > 240) return reject(new Error('240-request limit reached'));
    const timer = setTimeout(() => reject(new Error('Roon request timed out')), 15000);
    browse[method]({ ...options, multi_session_key: 'musicmesh-ten-albums' }, (error, result) => {
      clearTimeout(timer);
      if (error) reject(new Error(String(error))); else resolve(result);
    });
  });
  async function navigate(hierarchy, options) {
    const response = await call('browse', { hierarchy, ...options });
    if (response.action !== 'list') throw new Error(`Expected list, received ${response.action}`);
    return response;
  }
  async function loadAll(hierarchy, max = 2000) {
    let result = await call('load', { hierarchy, offset: 0, count: 100 });
    const firstPage = result;
    const items = [...result.items];
    while (items.length < Math.min(result.list.count, max)) {
      result = await call('load', { hierarchy, offset: items.length, count: Math.min(100, max - items.length) });
      if (!result.items.length) break;
      items.push(...result.items);
    }
    return { ...firstPage, items, complete: items.length === firstPage.list.count };
  }
  async function root(hierarchy) {
    await navigate(hierarchy, { pop_all: true });
    return loadAll(hierarchy);
  }
  async function open(hierarchy, item) {
    if (item?.hint !== 'list' || item.input_prompt) throw new Error('Only explicit navigation-list items may be opened');
    await navigate(hierarchy, { item_key: item.item_key });
    return loadAll(hierarchy);
  }
  try {
    const inventory = await root('albums');
    report.libraryAlbumCount = inventory.list.count;
    report.inventoryComplete = inventory.complete;
    fs.writeFileSync(path.join(directory, 'album-inventory.json'), JSON.stringify(inventory, null, 2));
    const groups = new Map();
    for (const item of inventory.items) {
      const key = identity(item.title, item.subtitle);
      const entries = groups.get(key) || [];
      entries.push(item); groups.set(key, entries);
    }
    const matches = [...history.entries()].filter(([key]) => groups.get(key)?.length === 1)
      .sort((a, b) => b[1].plays - a[1].plays);
    const artists = new Set();
    const selected = matches.filter(([, h]) => {
      const artist = normalize(h.artist);
      if (artists.has(artist)) return false;
      artists.add(artist); return true;
    }).slice(0, 10);
    if (selected.length !== 10) throw new Error(`Only ${selected.length} unambiguous album-name/artist candidates found`);
    report.selection = 'Ten highest-play-count exact album-title/artist-text candidates, one per artist; duplicate Roon title/artist entries excluded. Edition identity remains unverified.';
    report.exactCandidateCount = matches.length;
    for (const [key, historyAlbum] of selected) {
      // Reacquire a navigation key at its observed offset without reloading the library.
      await navigate('albums', { pop_all: true });
      const offset = inventory.items.findIndex(x => identity(x.title, x.subtitle) === key);
      const current = await call('load', { hierarchy: 'albums', offset, count: 1 });
      const item = current.items[0];
      if (!item || identity(item.title, item.subtitle) !== key) throw new Error('Album inventory changed during probe');
      const detail = await open('albums', item);
      report.albumTests.push({ title: historyAlbum.title, artist: historyAlbum.artist, plays: historyAlbum.plays,
        historyDistinctTrackTitles: historyAlbum.tracks.size, match: 'title-and-artist-candidate', editionVerified: false,
        libraryItem: item, detail, genreMemberships: [] });
      save();
    }
    const genres = await root('genres');
    report.genreRoot = genres;
    // Include all top-level genre memberships plus three documented Pop/Rock branches.
    const paths = genres.items.filter(x => x.hint === 'list').map(x => [x.title]);
    paths.push(['Pop/Rock', 'Alternative/Indie Rock'], ['Pop/Rock', 'Album Rock'], ['Pop/Rock', 'Contemporary Singer/Songwriter']);
    for (const genrePath of paths) {
      let listing = await root('genres');
      for (const title of genrePath) {
        const item = listing.items.find(x => x.title === title && x.hint === 'list');
        if (!item) throw new Error(`Genre path missing: ${genrePath.join(' / ')}`);
        listing = await open('genres', item);
      }
      const children = listing.items.filter(x => x.hint === 'list' && !['Albums', 'Artists'].includes(x.title));
      const albumsItem = listing.items.find(x => x.title === 'Albums' && x.hint === 'list');
      const membership = albumsItem ? await open('genres', albumsItem) : null;
      const membershipKeys = new Set((membership?.items || []).map(x => identity(x.title, x.subtitle)));
      const matched = report.albumTests.filter(x => membershipKeys.has(identity(x.title, x.artist)));
      for (const album of matched) album.genreMemberships.push({ path: genrePath, basis: 'observed Roon genre-browser album membership; may include inherited categories' });
      report.genreTests.push({ path: genrePath, children, complete: membership?.complete ?? false,
        albumCount: membership?.list.count ?? null, matchedAlbums: matched.map(x => ({ title: x.title, artist: x.artist })) });
      save();
    }
    const genresAgain = await root('genres');
    report.navigationKeyCheck = genres.items.map(before => ({ title: before.title, before: before.item_key,
      after: genresAgain.items.find(x => x.title === before.title)?.item_key }));
    report.limitations = ['Candidates are matched by album and artist text, not verified editions.',
      'Genre membership is a browse observation, not proof of a direct provider assignment or its customization origin.',
      'Only three Pop/Rock subgenre branches were tested; membership lists are not exhaustive genre assignments.',
      'The observed album item fields do not supply structured credits, UPC, ISRC or MusicBrainz IDs.',
      'Track labels/subtitles are display text, not typed instrument/producer/studio roles. No action items were opened.',
      'This test writes local receipts only; it does not import graph records or change playback.'];
    report.state = 'complete'; report.completedAt = new Date().toISOString(); save();
    return { tenAlbumTestComplete: true, testedAlbums: report.albumTests.length, requests,
      albumsWithGenreMembership: report.albumTests.filter(x => x.genreMemberships.length).length };
  } catch (error) {
    report.state = 'failed'; report.error = error.message; save(); throw error;
  }
}
module.exports.tenAlbums = tenAlbums;
