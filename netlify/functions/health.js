const { json, withErrorHandling, getTraceId } = require("./_lib/response");
const { getPool, query } = require("./_lib/db");

const checkTablesExist = async (tableNames) => {
  const result = await query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1)`,
    [tableNames]
  );
  const found = new Set(result.rows.map((row) => row.table_name));
  return tableNames.reduce((acc, table) => {
    acc[table] = found.has(table);
    return acc;
  }, {});
};

const checkKvConstraint = async () => {
  const result = await query(
    `SELECT constraint_name, constraint_type
     FROM information_schema.table_constraints
     WHERE table_schema = 'public'
       AND table_name = 'kv_store'
       AND constraint_type IN ('PRIMARY KEY', 'UNIQUE')`
  );
  if (result.rows.length === 0) return false;
  const keyResult = await query(
    `SELECT tc.constraint_name, kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
     WHERE tc.table_schema = 'public'
       AND tc.table_name = 'kv_store'
       AND tc.constraint_type IN ('PRIMARY KEY', 'UNIQUE')`
  );
  const columnsByConstraint = keyResult.rows.reduce((acc, row) => {
    acc[row.constraint_name] = acc[row.constraint_name] || [];
    acc[row.constraint_name].push(row.column_name);
    return acc;
  }, {});
  return Object.values(columnsByConstraint).some((columns) => {
    const set = new Set(columns);
    return set.has("namespace") && set.has("key") && set.size === 2;
  });
};

const checkProgramsColumns = async () => {
  const result = await query(
    `SELECT column_name
     FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'programs'`
  );
  const columns = new Set(result.rows.map((row) => row.column_name));
  const required = ["user_id", "status", "program", "created_at", "updated_at"];
  const missing = required.filter((column) => !columns.has(column));
  return { ok: missing.length === 0, missing };
};

exports.handler = withErrorHandling(async (event) => {
  const traceId = getTraceId(event);
  const checks = {
    databaseUrl: Boolean(process.env.DATABASE_URL),
    postgresConnection: false,
    tables: {
      kv_store: false,
      onboarding: false,
      programs: false,
    },
    kvStoreConstraint: false,
    programsColumns: { ok: false, missing: [] },
  };

  const timestamp = new Date().toISOString();
  console.log(`[health] trace=${traceId}`);
  if (!checks.databaseUrl) {
    return json(200, { ok: false, checks, traceId, timestamp });
  }

  try {
    const pool = getPool();
    await pool.query("SELECT 1");
    checks.postgresConnection = true;
  } catch (err) {
    return json(200, { ok: false, checks, traceId, timestamp });
  }

  const tableChecks = await checkTablesExist(["kv_store", "onboarding", "programs"]);
  checks.tables = tableChecks;
  if (tableChecks.kv_store) {
    checks.kvStoreConstraint = await checkKvConstraint();
  }
  if (tableChecks.programs) {
    checks.programsColumns = await checkProgramsColumns();
  }

  const ok =
    checks.databaseUrl &&
    checks.postgresConnection &&
    checks.tables.kv_store &&
    checks.tables.onboarding &&
    checks.tables.programs &&
    checks.kvStoreConstraint &&
    checks.programsColumns.ok;

  return json(200, { ok, checks, traceId, timestamp });
});
