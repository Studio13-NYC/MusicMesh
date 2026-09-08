import { defineConfig } from "prisma/config";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
require("./src/env.js").validateEnv();

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: process.env.DIRECT_URL
    ? { url: process.env.DIRECT_URL }
    : undefined,
});
