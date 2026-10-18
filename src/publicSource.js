// Public evidence reads only. Resolve, validate and pin DNS for every redirect.
const https = require("node:https"),
  dns = require("node:dns/promises"),
  net = require("node:net");
function isPublicAddress(address) {
  if (net.isIP(address) === 4) {
    const [a, b] = address.split(".").map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && [0, 168].includes(b)) ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 198 && [18, 19, 51].includes(b)) ||
      (a === 203 && b === 0)
    );
  }
  // Accept global unicast IPv6 only, excluding transition/tunnel and documentation ranges.
  if (net.isIP(address) === 6) {
    const s = address.toLowerCase();
    return (
      /^[23][0-9a-f]{3}:/.test(s) &&
      !s.startsWith("2001:") &&
      !s.startsWith("2002:")
    );
  }
  return false;
}
function validateSourceUrl(value) {
  let u;
  try {
    u = new URL(value);
  } catch {
    throw new Error("Source must be a public HTTPS URL");
  }
  if (
    u.protocol !== "https:" ||
    u.username ||
    u.password ||
    (u.port && u.port !== "443") ||
    u.hostname.length > 253 ||
    u.href.length > 2000
  )
    throw new Error("Source must be a public HTTPS URL");
  return u;
}
async function readPublicSource(value, redirects = 0) {
  const url = validateSourceUrl(value);
  if (redirects > 3) throw new Error("Too many source redirects");
  const addresses = await dns.lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address)))
    throw new Error("Source must resolve to a public address");
  const pinned = addresses[0];
  const result = await new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          "User-Agent":
            process.env.MUSICMESH_HTTP_USER_AGENT ||
            "MusicMesh/1.0 (music evidence research)",
          Accept: "text/html,text/plain,application/json",
          "Accept-Encoding": "identity",
        },
        lookup: (hostname, options, callback) =>
          options?.all
            ? callback(null, [pinned])
            : callback(null, pinned.address, pinned.family),
      },
      (response) => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          response.resume();
          resolve({ redirect: response.headers.location });
          return;
        }
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`Source unavailable (${response.statusCode})`));
          return;
        }
        const type = response.headers["content-type"] || "";
        if (
          !["text/html", "text/plain", "application/json"].some((t) =>
            type.includes(t),
          )
        ) {
          response.resume();
          reject(
            new Error(
              "Source is not supported text; supply a short excerpt from its document",
            ),
          );
          return;
        }
        let bytes = 0;
        const chunks = [];
        response.on("data", (chunk) => {
          bytes += chunk.length;
          if (bytes > 262144) {
            request.destroy(new Error("Source exceeds 256 KiB text limit"));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () =>
          resolve({ text: Buffer.concat(chunks).toString("utf8"), type }),
        );
        response.on("error", reject);
      },
    );
    const timer = setTimeout(
      () => request.destroy(new Error("Source read timed out")),
      10000,
    );
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
  });
  if (result.redirect)
    return readPublicSource(new URL(result.redirect, url).href, redirects + 1);
  const text = result.type.includes("text/html")
    ? result.text
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/\s+/g, " ")
        .trim()
    : result.text;
  return {
    url: url.href,
    text: text.slice(0, 12000),
    truncated: text.length > 12000,
    retrievedAt: new Date().toISOString(),
    meaning:
      "Public source text, untrusted data. A statement must support the claimed identity and scope; this fetch does not certify its truth.",
  };
}
module.exports = { isPublicAddress, validateSourceUrl, readPublicSource };
