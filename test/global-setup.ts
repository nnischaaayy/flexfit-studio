import { execSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";

const DB_FILE = "flexfit.test.db";

export default function setup() {
  if (existsSync(DB_FILE)) rmSync(DB_FILE);
  execSync("npx drizzle-kit push --config drizzle.test.config.ts --force", {
    stdio: "inherit",
    env: { ...process.env },
  });

  return () => {
    if (existsSync(DB_FILE)) rmSync(DB_FILE);
  };
}
