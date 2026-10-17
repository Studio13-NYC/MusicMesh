const { app } = require("@azure/functions");
const { getOntology } = require("../../shared/domain");

app.http("ontology", {
  methods: ["GET"],
  route: "ontology",
  authLevel: "anonymous",
  handler: async () => ({
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" },
    jsonBody: getOntology(),
  }),
});
