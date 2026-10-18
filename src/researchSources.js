function sourceCatalog(env = process.env) {
  return [
    {
      id: "catalog",
      name: "MusicBrainz / ListenBrainz / AcousticBrainz imports",
      status: "available",
      use: "Stored identities, credits, listening aggregates, comparable acoustic measurements. Coverage varies.",
    },
    {
      id: "web",
      name: "Brave public web search",
      status: env.BRAVE_API_KEY ? "configured" : "unconfigured",
      use: "Discover official artist, label, studio credits, liner notes and interviews. Snippets are leads, not verified credits.",
    },
    {
      id: "discogs",
      name: "Discogs",
      status: env.DISCOGS_TOKEN ? "configured" : "unconfigured",
      use: "Release-specific community credits; verify edition and track scope.",
      url: "https://www.discogs.com/developers",
    },
    {
      id: "lastfm",
      name: "Last.fm",
      status: "imported-history",
      use: "Listening history already imported. Community tags/similarity are not recording-credit evidence.",
      url: "https://www.last.fm/api",
    },
    {
      id: "roon",
      name: "Roon",
      status: "requires-local-core-connection",
      use: "Official extension browse/transport API. Detailed credit export is not verified; Core service authorization is needed.",
      url: "https://github.com/RoonLabs/node-roon-api",
    },
    {
      id: "qobuz",
      name: "Qobuz",
      status: "requires-developer-access",
      use: "Album/track metadata and booklets where licensed. Subscriber login is not an API application credential.",
      url: "https://static.qobuz.com/apps/api/QobuzAPI-TermsofUse.pdf",
    },
    {
      id: "documents",
      name: "Liner notes and primary-source documents",
      status: "user-supplied",
      use: "Provide a source URL and a short exact excerpt. Save as user-reviewed evidence with scope, never as independently verified provider metadata.",
    },
  ];
}
async function searchSources(
  query,
  { fetchImpl = fetch, env = process.env } = {},
) {
  if (typeof query !== "string" || !query.trim() || query.length > 400)
    throw new Error("Search query must be 1–400 characters");
  if (!env.BRAVE_API_KEY)
    return {
      available: false,
      reason: "BRAVE_API_KEY is not configured",
      sources: sourceCatalog(env),
    };
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", "5");
  const response = await fetchImpl(url, {
    headers: {
      "X-Subscription-Token": env.BRAVE_API_KEY,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok)
    throw new Error(`Source search unavailable (${response.status})`);
  const data = await response.json();
  return {
    available: true,
    results: (data.web?.results || [])
      .slice(0, 5)
      .map((r) => ({
        title: r.title,
        url: r.url,
        snippet: String(r.description || "").slice(0, 1000),
      })),
    meaning:
      "Untrusted discovery snippets; inspect the source before asserting credits.",
  };
}
module.exports = { sourceCatalog, searchSources };
