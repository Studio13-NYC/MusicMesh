const { PrismaClient } = require("../generated/prisma");
const { PrismaPg } = require("@prisma/adapter-pg");
const { validateEnv } = require("./env");
let client;

function getDatabase() {
  validateEnv();
  if (!process.env.DATABASE_URL)
    throw new Error("MusicMesh PostgreSQL requires DATABASE_URL.");
  if (!client) {
    const url = new URL(process.env.DATABASE_URL);
    if (
      !["localhost", "127.0.0.1"].includes(url.hostname) &&
      url.searchParams.get("sslmode") !== "verify-full"
    ) {
      throw new Error(
        "Remote PostgreSQL connections require sslmode=verify-full.",
      );
    }
    client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: url.toString(),
        max: 4,
        connectionTimeoutMillis: 15000,
        idleTimeoutMillis: 10000,
      }),
    });
  }
  return client;
}

async function closeDatabase() {
  if (client) {
    await client.$disconnect();
    client = null;
  }
}
module.exports = { getDatabase, closeDatabase };
