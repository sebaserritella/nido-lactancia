#!/usr/bin/env node
/**
 * Daily users report by last_seen_at (Argentina time), plus who logs most
 * (feeds + diapers by created_by). Writes an HTML table and opens it.
 *
 * Needs in .env.local (gitignored):
 *   VITE_SUPABASE_URL=...
 *   SUPABASE_SERVICE_ROLE_KEY=...
 *
 * Run once:
 *   npm run report:users
 */

import { mkdir, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync } from "node:fs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const timeZone = "America/Argentina/Buenos_Aires";
const pageSize = 1000;
const recentMs = 7 * 24 * 60 * 60 * 1000;

function loadEnvFile(path) {
  if (!existsSync(path)) return {};
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function formatStamp(iso, withSeconds = false) {
  if (!iso) return "nunca";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("es-AR", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...(withSeconds ? { second: "2-digit" } : {}),
    hour12: false,
  }).format(date);
}

function todayFileStamp() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function openFile(path) {
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  const result =
    process.platform === "win32"
      ? spawnSync("cmd", ["/c", "start", "", path], { stdio: "ignore" })
      : spawnSync(opener, [path], { stdio: "ignore" });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Could not open report with ${opener} (exit ${result.status})`);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function fetchAll(baseUrl, path, serviceKey) {
  const headers = {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
  };
  const rows = [];
  let from = 0;
  for (;;) {
    const response = await fetch(`${baseUrl}${path}`, {
      headers: {
        ...headers,
        Range: `${from}-${from + pageSize - 1}`,
        Prefer: "count=exact",
      },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Supabase REST ${response.status} ${path}: ${body}`);
    }
    const chunk = await response.json();
    if (!Array.isArray(chunk)) {
      throw new Error(`Unexpected response for ${path}`);
    }
    rows.push(...chunk);
    if (chunk.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function tallyUsage(events, recentCutoff) {
  /** @type {Map<string, { recent: number; total: number }>} */
  const byUser = new Map();
  for (const event of events) {
    const userId = event.created_by;
    if (!userId) continue;
    const bucket = byUser.get(userId) ?? { recent: 0, total: 0 };
    bucket.total += 1;
    const at = event.at ? new Date(event.at).getTime() : NaN;
    if (Number.isFinite(at) && at >= recentCutoff) bucket.recent += 1;
    byUser.set(userId, bucket);
  }
  return byUser;
}

function pad(value, width, align = "left") {
  const text = String(value);
  if (text.length >= width) return text;
  const space = " ".repeat(width - text.length);
  return align === "right" ? space + text : text + space;
}

function buildTextTable(headers, rows) {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => String(row[index] ?? "").length)),
  );
  const alignRight = headers.map((header) =>
    /^(puesto|registros|7d|total)/i.test(header),
  );
  const line = (cells) =>
    cells
      .map((cell, index) => pad(cell, widths[index], alignRight[index] ? "right" : "left"))
      .join("  ");
  return [line(headers), line(widths.map((width) => "-".repeat(width))), ...rows.map((row) => line(row))];
}

async function main() {
  const fileEnv = {
    ...loadEnvFile(join(repoRoot, ".env")),
    ...loadEnvFile(join(repoRoot, ".env.local")),
  };
  const url = (process.env.VITE_SUPABASE_URL || fileEnv.VITE_SUPABASE_URL || "").trim().replace(/\/$/, "");
  const serviceKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    fileEnv.SUPABASE_SERVICE_ROLE_KEY ||
    ""
  ).trim();

  if (!url) {
    throw new Error("Missing VITE_SUPABASE_URL in .env.local");
  }
  if (!serviceKey) {
    throw new Error(
      "Missing SUPABASE_SERVICE_ROLE_KEY in .env.local (Supabase → Project Settings → API → service_role). Do not commit this key.",
    );
  }

  const profiles = /** @type {{ id: string; email: string; last_seen_at: string | null; created_at: string | null }[]} */ (
    await fetchAll(
      url,
      "/rest/v1/profiles?select=id,email,last_seen_at,created_at&order=last_seen_at.desc.nullslast,email.asc",
      serviceKey,
    )
  );
  const feeds = /** @type {{ created_by: string; created_at: string }[]} */ (
    await fetchAll(url, "/rest/v1/feeds?select=created_by,created_at", serviceKey)
  );
  const diapers = /** @type {{ created_by: string; created_at: string }[]} */ (
    await fetchAll(url, "/rest/v1/diapers?select=created_by,created_at", serviceKey)
  );

  const recentCutoff = Date.now() - recentMs;
  const usage = tallyUsage(
    [
      ...feeds.map((row) => ({ created_by: row.created_by, at: row.created_at })),
      ...diapers.map((row) => ({ created_by: row.created_by, at: row.created_at })),
    ],
    recentCutoff,
  );

  const rankedIds = [...usage.entries()]
    .sort(
      (left, right) =>
        right[1].recent - left[1].recent ||
        right[1].total - left[1].total ||
        (emailByIdSafe(profiles, left[0]) > emailByIdSafe(profiles, right[0]) ? 1 : -1),
    )
    .map(([userId]) => userId);

  function emailByIdSafe(list, id) {
    return list.find((row) => row.id === id)?.email ?? id;
  }

  /** @type {Map<string, number>} */
  const usageRank = new Map();
  let rank = 0;
  for (const userId of rankedIds) {
    const counts = usage.get(userId);
    if (!counts || counts.recent <= 0) continue;
    rank += 1;
    usageRank.set(userId, rank);
  }

  const topUserId = rankedIds.find((userId) => (usage.get(userId)?.recent ?? 0) > 0) ?? null;
  const topCounts = topUserId ? usage.get(topUserId) : null;
  const topEmail = topUserId ? emailByIdSafe(profiles, topUserId) : null;

  const tableRows = profiles.map((row) => {
    const counts = usage.get(row.id) ?? { recent: 0, total: 0 };
    const puesto = usageRank.has(row.id) ? String(usageRank.get(row.id)) : "—";
    const masUso = topUserId && row.id === topUserId ? "sí" : "";
    return {
      email: row.email,
      lastSeen: formatStamp(row.last_seen_at),
      created: formatStamp(row.created_at),
      puesto,
      recent: String(counts.recent),
      total: String(counts.total),
      masUso,
      isTop: Boolean(topUserId && row.id === topUserId),
    };
  });

  const generatedAt = formatStamp(new Date().toISOString(), true);
  const textHeaders = ["puesto uso", "más uso", "email", "última vez", "cuenta creada", "registros 7d", "registros total"];
  const textRows = tableRows.map((row) => [
    row.puesto,
    row.masUso,
    row.email,
    row.lastSeen,
    row.created,
    row.recent,
    row.total,
  ]);
  const textTable = buildTextTable(textHeaders, textRows);

  const summary =
    topEmail && topCounts
      ? `Quién la usa más (7 días): ${topEmail} — ${topCounts.recent} registros (total ${topCounts.total})`
      : "Quién la usa más (7 días): nadie cargó tomas/pañales.";

  const htmlRows = tableRows
    .map(
      (row) => `<tr class="${row.isTop ? "top" : ""}">
  <td class="num">${escapeHtml(row.puesto)}</td>
  <td class="flag">${escapeHtml(row.masUso)}</td>
  <td>${escapeHtml(row.email)}</td>
  <td>${escapeHtml(row.lastSeen)}</td>
  <td>${escapeHtml(row.created)}</td>
  <td class="num">${escapeHtml(row.recent)}</td>
  <td class="num">${escapeHtml(row.total)}</td>
</tr>`,
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Nido lactancia — usuarios ${escapeHtml(todayFileStamp())}</title>
  <style>
    :root { color-scheme: light; }
    body {
      margin: 0;
      padding: 24px;
      font: 15px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      color: #241c18;
      background: #f7f1ea;
    }
    main {
      max-width: 1100px;
      margin: 0 auto;
      background: #fffdf9;
      border: 1px solid #e4d6c6;
      border-radius: 16px;
      padding: 20px 22px 28px;
      box-shadow: 0 8px 24px rgba(36, 28, 24, 0.06);
    }
    h1 { margin: 0 0 6px; font-size: 1.35rem; }
    .meta { margin: 0 0 18px; color: #6e625a; }
    .summary {
      margin: 0 0 18px;
      padding: 12px 14px;
      border-radius: 12px;
      background: #f3e2c4;
      font-weight: 600;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-variant-numeric: tabular-nums;
    }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid #eadfce;
      text-align: left;
      vertical-align: top;
    }
    th {
      font-size: 0.78rem;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      color: #6e625a;
      background: #faf6f0;
    }
    td.num, th.num { text-align: right; }
    td.flag { text-align: center; font-weight: 700; color: #8a4b2a; }
    tr.top { background: #fff3df; }
    tr.top td:nth-child(3) { font-weight: 700; }
    pre {
      display: none;
    }
  </style>
</head>
<body>
  <main>
    <h1>Nido lactancia — usuarios</h1>
    <p class="meta">Generado: ${escapeHtml(generatedAt)} (${escapeHtml(timeZone)}) · ${profiles.length} cuentas</p>
    <p class="summary">${escapeHtml(summary)}</p>
    <table>
      <thead>
        <tr>
          <th class="num">Puesto uso</th>
          <th>Más uso</th>
          <th>Email</th>
          <th>Última vez</th>
          <th>Cuenta creada</th>
          <th class="num">Registros 7d</th>
          <th class="num">Registros total</th>
        </tr>
      </thead>
      <tbody>
${htmlRows}
      </tbody>
    </table>
  </main>
  <pre>${escapeHtml([summary, "", ...textTable].join("\n"))}</pre>
</body>
</html>
`;

  const reportsDir = join(repoRoot, "reports");
  await mkdir(reportsDir, { recursive: true });
  const stamp = todayFileStamp();
  const htmlPath = join(reportsDir, `users-${stamp}.html`);
  const txtPath = join(reportsDir, `users-${stamp}.txt`);
  await writeFile(htmlPath, html, "utf8");
  await writeFile(txtPath, [`Nido lactancia — usuarios`, `Generado: ${generatedAt} (${timeZone})`, `Total cuentas: ${profiles.length}`, "", summary, "", ...textTable, ""].join("\n"), "utf8");
  console.log(htmlPath);
  openFile(htmlPath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
