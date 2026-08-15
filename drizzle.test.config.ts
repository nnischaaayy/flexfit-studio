import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle-test",
  dialect: "turso",
  dbCredentials: {
    url: "file:flexfit.test.db",
  },
} satisfies Config;
