/**
 * Verifies that the Azure Static Web Apps Functions bundle can load after the
 * shared files have been staged under api/.
 */

require("../api/src/index.js");

console.log("verifySwaApiBundle: Azure Functions entrypoint loaded.");
