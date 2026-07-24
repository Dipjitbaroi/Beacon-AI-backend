// Direct DB comparison: queries live information_schema and compares it
// to the expected schema (tables, columns, indexes, foreign keys, enums).
// Run with: node scripts/db-diff.mjs
import "dotenv/config";
import pg from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();

const expected = {
  tables: {
    reports: [
      ["id", "text", "NO"],
      ["trackingCode", "text", "NO"],
      ["citizenName", "character varying", "YES"],
      ["contact", "character varying", "YES"],
      ["description", "text", "NO"],
      ["locationText", "text", "NO"],
      ["latitude", "double precision", "YES"],
      ["longitude", "double precision", "YES"],
      ["category", "USER-DEFINED", "NO"],
      ["aiCategory", "USER-DEFINED", "YES"],
      ["severityLevel", "USER-DEFINED", "YES"],
      ["severityScore", "double precision", "YES"],
      ["severityRationale", "text", "YES"],
      ["summary", "text", "YES"],
      ["canonicalSummary", "text", "YES"],
      ["normalizedLocation", "text", "YES"],
      ["language", "USER-DEFINED", "NO"],
      ["aiConfidence", "double precision", "YES"],
      ["embedding", "ARRAY", "YES"],
      ["imageUrls", "ARRAY", "YES"],
      ["status", "USER-DEFINED", "NO"],
      ["assignedDepartment", "USER-DEFINED", "YES"],
      ["duplicateOfId", "text", "YES"],
      ["duplicateScore", "double precision", "YES"],
      ["suggestedAction", "text", "YES"],
      ["createdAt", "timestamp without time zone", "NO"],
      ["updatedAt", "timestamp without time zone", "NO"],
    ],
    progress_updates: [
      ["id", "text", "NO"],
      ["reportId", "text", "NO"],
      ["status", "USER-DEFINED", "NO"],
      ["note", "text", "YES"],
      ["visibility", "USER-DEFINED", "NO"],
      ["updatedById", "text", "YES"],
      ["createdAt", "timestamp without time zone", "NO"],
    ],
    users: [
      ["id", "text", "NO"],
      ["name", "character varying", "NO"],
      ["email", "character varying", "NO"],
      ["password", "character varying", "NO"],
      ["role", "USER-DEFINED", "NO"],
      ["createdAt", "timestamp without time zone", "NO"],
      ["updatedAt", "timestamp without time zone", "NO"],
    ],
  },
  enums: {
    Role: ["user", "admin"],
    Language: ["bn", "en", "unknown"],
    ReportCategory: ["pothole", "broken_streetlight", "water_leak", "illegal_dumping", "other"],
    SeverityLevel: ["low", "medium", "high", "critical"],
    ReportStatus: ["pending", "under_review", "assigned", "in_progress", "resolved", "rejected"],
    Department: ["roads_and_highways", "electrical", "water_and_sewerage", "waste_management", "general"],
    ProgressVisibility: ["public", "internal"],
  },
  uniqueIndexes: {
    reports: ["reports_trackingCode_key"],
    users: ["users_email_key"],
  },
  fk: [
    ["reports", "reports_duplicateOfId_fkey", "duplicateOfId", "reports", "id"],
    ["progress_updates", "progress_updates_reportId_fkey", "reportId", "reports", "id"],
    ["progress_updates", "progress_updates_updatedById_fkey", "updatedById", "users", "id"],
  ],
};

const issues = [];
const ok = (msg) => console.log(`  OK   ${msg}`);
const bad = (msg) => { console.log(`  MISS ${msg}`); issues.push(msg); };

console.log("== Local migration alignment with live DB ==\n");

// 1. Enums
console.log("Enums:");
const { rows: enumRows } = await client.query(`
  SELECT t.typname, array_agg(e.enumlabel ORDER BY e.enumsortorder) AS labels
  FROM pg_type t
  JOIN pg_enum e ON t.oid = e.enumtypid
  JOIN pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
  GROUP BY t.typname
`);
const liveEnums = Object.fromEntries(
  enumRows.map((r) => [r.typname, typeof r.labels === "string" ? r.labels.replace(/[{}]/g, "").split(",") : r.labels]),
);
for (const [name, labels] of Object.entries(expected.enums)) {
  if (!liveEnums[name]) bad(`enum ${name} missing`);
  else {
    const same = labels.length === liveEnums[name].length && labels.every((v, i) => v === liveEnums[name][i]);
    same ? ok(`enum ${name} = [${labels.join(", ")}]`) : bad(`enum ${name} expected [${labels.join(", ")}] got [${liveEnums[name].join(", ")}]`);
  }
}

// 2. Columns
console.log("\nColumns:");
const { rows: colRows } = await client.query(`
  SELECT table_name, column_name, data_type, is_nullable
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name IN ('reports','progress_updates','users')
  ORDER BY table_name, ordinal_position
`);
const liveCols = {};
for (const r of colRows) {
  (liveCols[r.table_name] ??= []).push([r.column_name, r.data_type, r.is_nullable === "YES" ? "YES" : "NO"]);
}
for (const [table, cols] of Object.entries(expected.tables)) {
  if (!liveCols[table]) { bad(`table ${table} missing`); continue; }
  for (const [col, type, nullable] of cols) {
    const found = liveCols[table].find((c) => c[0] === col);
    if (!found) { bad(`column ${table}.${col} missing`); continue; }
    const typeOk = found[1] === type || (type === "ARRAY" && found[1].endsWith("[]"));
    const nullOk = found[2] === nullable;
    if (typeOk && nullOk) ok(`${table}.${col} (${found[1]}, ${nullable})`);
    else bad(`${table}.${col} expected ${type}/${nullable} got ${found[1]}/${found[2]}`);
  }
}

// 3. Unique indexes
console.log("\nUnique indexes:");
const { rows: idxRows } = await client.query(`
  SELECT tablename, indexname FROM pg_indexes
  WHERE schemaname = 'public'
`);
for (const [table, names] of Object.entries(expected.uniqueIndexes)) {
  for (const n of names) {
    const hit = idxRows.find((r) => r.tablename === table && r.indexname === n);
    hit ? ok(`${table}.${n}`) : bad(`index ${table}.${n} missing`);
  }
}

// 4. Foreign keys
console.log("\nForeign keys:");
const { rows: fkRows } = await client.query(`
  SELECT tc.table_name, tc.constraint_name, kcu.column_name,
         ccu.table_name AS foreign_table_name, ccu.column_name AS foreign_column_name
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu USING (constraint_name, table_schema)
  JOIN information_schema.constraint_column_usage ccu USING (constraint_name, table_schema)
  WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
`);
for (const [table, name, col, refTable, refCol] of expected.fk) {
  const hit = fkRows.find((r) => r.table_name === table && r.constraint_name === name);
  if (hit) ok(`${name} (${table}.${col} -> ${refTable}.${refCol})`);
  else bad(`FK ${name} (${table}.${col} -> ${refTable}.${refCol}) missing`);
}

console.log("\n== Result ==");
if (issues.length === 0) console.log("ALIGNED: live DB schema matches the local migration schema.");
else {
  console.log(`MISMATCH: ${issues.length} issue(s) found.`);
  for (const i of issues) console.log("  -", i);
}

await client.end();
