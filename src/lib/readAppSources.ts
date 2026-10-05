import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AppSource } from "./clientQueries";

/** Test-only. Kept out of the app tsconfig because it reads the repo from Node. */
export function readAppSources(srcDir: string): AppSource[] {
  const files: AppSource[] = [];
  for (const path of walk(srcDir)) {
    if (!path.endsWith(".ts") && !path.endsWith(".tsx")) continue;
    if (path.endsWith(".test.ts") || path.endsWith(".test.tsx")) continue;
    files.push({ name: path, source: readFileSync(path, "utf8") });
  }
  return files;
}

function walk(dir: string): string[] {
  const paths: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) paths.push(...walk(path));
    else paths.push(path);
  }
  return paths;
}
