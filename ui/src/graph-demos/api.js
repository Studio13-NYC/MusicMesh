const API_BASE_RAW = import.meta.env.VITE_MUSICMESH_API_BASE ?? "";
const API_BASE_URL =
  typeof API_BASE_RAW === "string" ? API_BASE_RAW.trim().replace(/\/$/, "") : "";

async function fetchJson(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }

  return payload;
}

export async function searchGraphSeeds(query, limit = 8) {
  const params = new URLSearchParams();

  if (typeof query === "string") {
    params.set("q", query);
  }

  params.set("limit", String(limit));

  return fetchJson(`/api/graph-demo/search?${params.toString()}`);
}

export async function fetchGraphSubgraph(seedId, options = {}) {
  return fetchJson("/api/graph-demo/subgraph", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      seedId,
      depth: options.depth ?? 2,
      maxNodes: options.maxNodes ?? 60,
      maxEdges: options.maxEdges ?? 90,
      pathLimit: options.pathLimit ?? 120
    })
  });
}

export async function fetchThreadFocusedGraph(threadId, window = 200) {
  const params = new URLSearchParams();
  params.set("threadId", threadId);
  params.set("window", String(window));

  return fetchJson(`/api/graph-demo/thread-focus?${params.toString()}`);
}

export async function expandGraphNode(nodeId, currentNodeIds, currentEdgeIds) {
  return fetchJson("/api/graph-demo/expand", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      nodeId,
      currentNodeIds,
      currentEdgeIds,
      depth: 1,
      maxNodes: 40,
      maxEdges: 60,
      pathLimit: 80
    })
  });
}

export async function fetchNodeDetail(nodeId) {
  return fetchJson(`/api/graph-demo/node/${encodeURIComponent(nodeId)}`);
}
