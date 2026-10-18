const store = require("./researchStore");
async function researchApi(action, body = {}) {
  if (process.env.MUSICMESH_MAINTENANCE === "true" && action !== "read")
    return {
      status: 503,
      body: { error: "MusicMesh is undergoing maintenance." },
    };
  try {
    const result =
      action === "read"
        ? await store.readRun(body.id)
        : action === "decision"
          ? await store.decide(body)
          : await store.startOrAdvance(body);
    return { status: 200, body: result };
  } catch (error) {
    return {
      status: /expired|not found/.test(error.message)
        ? 404
        : /changed|stale/.test(error.message)
          ? 409
          : 400,
      body: { error: error.message },
    };
  }
}
module.exports = { researchApi };
