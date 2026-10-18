const test = require("node:test"),
  assert = require("node:assert/strict");
const { isPublicAddress, validateSourceUrl } = require("../src/publicSource");
test("public source requests reject private networks, credentials and non-HTTPS ports", () => {
  for (const ip of [
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "192.168.1.1",
    "::1",
    "::ffff:127.0.0.1",
    "fc00::1",
    "fe80::1",
    "0.0.0.0",
  ])
    assert.equal(isPublicAddress(ip), false, ip);
  assert.equal(isPublicAddress("8.8.8.8"), true);
  assert.throws(() => validateSourceUrl("https://x:y@example.com"), /public/);
  assert.throws(() => validateSourceUrl("http://example.com"), /public/);
  assert.throws(() => validateSourceUrl("https://example.com:8443"), /public/);
});
