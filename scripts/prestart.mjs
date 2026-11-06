import { spawnSync } from "node:child_process";

const environment = process.env.ENVIRONMENT;

if (environment !== "development" && environment !== "production") {
  console.error(
    'Set the "environment" variable to "development" or "production".',
  );
  process.exit(1);
}

if (environment === "development") {
  const npmCli = process.env.npm_execpath;
  if (!npmCli) {
    console.error("Could not locate npm to build the development app.");
    process.exit(1);
  }

  const build = spawnSync(process.execPath, [npmCli, "run", "build"], {
    stdio: "inherit",
  });
  if (build.error) {
    console.error("Could not build the development app.", build.error);
    process.exit(1);
  }
  process.exitCode = build.status ?? 1;
}
