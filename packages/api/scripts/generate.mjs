// Regenerates the typed client from the Django OpenAPI schema.
//   1. backend: `manage.py spectacular` writes the schema (JSON)
//   2. openapi-typescript turns it into `schema.d.ts`
// Output lives in src/generated/ (git-ignored; CI and scripts/dev.sh regenerate it).
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const backend = resolve(root, "backend");
const outDir = resolve(here, "../src/generated");
const schemaFile = resolve(outDir, "openapi.json");
const typesFile = resolve(outDir, "schema.d.ts");

mkdirSync(outDir, { recursive: true });

const run = (cmd, args, cwd) => execFileSync(cmd, args, { cwd, stdio: "inherit" });

// API_SCHEMA_PYTHON runs the schema with a given interpreter instead of `uv run` (the server's
// auto-deploy builds the portal with a throwaway environment of the release being deployed).
const python = process.env.API_SCHEMA_PYTHON;
run(
  python ?? "uv",
  [
    ...(python ? [] : ["run", "python"]),
    "manage.py",
    "spectacular",
    "--format",
    "openapi-json",
    "--validate",
    "--fail-on-warn",
    "--file",
    schemaFile,
  ],
  backend,
);
run("pnpm", ["exec", "openapi-typescript", schemaFile, "--output", typesFile], resolve(here, ".."));
