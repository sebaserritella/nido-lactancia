export type AppSource = {
  name: string;
  source: string;
};

/** Columns each screen asks PostgREST to return. A name that is not a column becomes a 42703 at runtime. */
export function queriedColumnsByTable(source: string): Map<string, Set<string>> {
  const constants = new Map<string, string>();
  for (const match of source.matchAll(/const\s+([A-Za-z0-9_]+)\s*=\s*"([^"]*)"/g)) {
    constants.set(match[1], match[2]);
  }
  const tables = new Map<string, Set<string>>();
  for (const match of source.matchAll(/\.from\(\s*"([a-z_]+)"\s*\)([\s\S]{0,800}?)\.select\(\s*([^)]+?)\s*\)/g)) {
    if (match[2].includes(".from(")) continue;
    const columns = resolveColumns(match[3], constants);
    const set = tables.get(match[1]) ?? new Set<string>();
    for (const column of columns) set.add(column);
    tables.set(match[1], set);
  }
  return tables;
}

export function queriedColumnsFromSources(files: AppSource[]): Map<string, Set<string>> {
  const merged = new Map<string, Set<string>>();
  for (const file of files) {
    let found: Map<string, Set<string>>;
    try {
      found = queriedColumnsByTable(file.source);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`${file.name}: ${message}`);
    }
    for (const [table, columns] of found) {
      const set = merged.get(table) ?? new Set<string>();
      for (const column of columns) set.add(column);
      merged.set(table, set);
    }
  }
  return merged;
}

function resolveColumns(argument: string, constants: Map<string, string>): string[] {
  const trimmed = argument.trim();
  const literal = trimmed.match(/^"([^"]*)"$/);
  const raw = literal ? literal[1] : constants.get(trimmed);
  if (raw == null) {
    throw new Error(`Could not resolve select(${trimmed})`);
  }
  if (raw.trim() === "*") return [];
  return raw
    .split(",")
    .map((column) => column.trim())
    .filter((column) => column.length > 0);
}
