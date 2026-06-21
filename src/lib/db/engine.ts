import initSqlJs, { Database, SqlValue } from 'sql.js';
import path from 'path';
import {
  ColumnType,
  CsvRow,
  DatasetSchema,
  getDataset,
  hydrateDatasetFromStorage,
  setDatasetSchema,
} from '@/lib/data-store';
import { getCurrentSessionId } from '@/lib/session';
import { validateAndSanitizeSql } from './sql-validator';
import { loadDatasetBlob, saveDatasetBlob, deleteAllDatasetStorage } from './persistence';

const DATASET_TABLE = 'dataset';
const BATCH_SIZE = 500;

export interface QueryResultSet {
  columns: string[];
  rows: Record<string, SqlValue>[];
  rowCount: number;
}

export interface DatasetDescription {
  tableName: string;
  rowCount: number;
  columns: Array<{ name: string; type: string; sqlType: string; quotedName: string }>;
  sampleRows: Record<string, SqlValue>[];
  summary: string;
}

interface SqliteStore {
  db: Database | null;
  schema: DatasetSchema | null;
}

interface GlobalSqliteState {
  sessions: Map<string, SqliteStore>;
  sqlJs: Awaited<ReturnType<typeof initSqlJs>> | null;
}

const globalForStore = globalThis as unknown as { __sqliteStoreState?: GlobalSqliteState };

function getGlobalState(): GlobalSqliteState {
  if (!globalForStore.__sqliteStoreState) {
    globalForStore.__sqliteStoreState = {
      sessions: new Map(),
      sqlJs: null,
    };
  }
  return globalForStore.__sqliteStoreState;
}

function getStore(sessionId?: string): SqliteStore {
  const id = sessionId ?? getCurrentSessionId();
  const state = getGlobalState();
  let store = state.sessions.get(id);
  if (!store) {
    store = { db: null, schema: null };
    state.sessions.set(id, store);
  }
  return store;
}

async function getSqlJs() {
  const state = getGlobalState();
  if (!state.sqlJs) {
    state.sqlJs = await initSqlJs({
      locateFile: (file) => path.join(process.cwd(), 'node_modules/sql.js/dist', file),
    });
  }
  return state.sqlJs;
}

export function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}

function columnTypeToSqlite(type: ColumnType): string {
  switch (type) {
    case 'number':
      return 'REAL';
    case 'boolean':
      return 'INTEGER';
    default:
      return 'TEXT';
  }
}

function appTypeFromSqlite(sqlType: string): ColumnType {
  const upper = sqlType.toUpperCase();
  if (upper.includes('INT') || upper.includes('BOOL')) return 'boolean';
  if (upper.includes('REAL') || upper.includes('FLOAT') || upper.includes('DOUBLE') || upper.includes('NUM')) {
    return 'number';
  }
  return 'string';
}

function cellToSqlValue(value: CsvRow[string]): SqlValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (typeof value === 'number') return value;
  return String(value);
}

function rowsToObjects(columns: string[], rawRows: SqlValue[][]): Record<string, SqlValue>[] {
  return rawRows.map((row) => {
    const obj: Record<string, SqlValue> = {};
    columns.forEach((col, i) => {
      obj[col] = row[i];
    });
    return obj;
  });
}

export function exportDatabase(): Uint8Array | null {
  const store = getStore();
  if (!store.db) return null;
  return store.db.export();
}

export async function importDatabase(buffer: Uint8Array, schema: DatasetSchema): Promise<void> {
  const SQL = await getSqlJs();
  const store = getStore();

  if (store.db) {
    store.db.close();
  }

  store.db = new SQL.Database(buffer);
  store.schema = schema;
}

export async function initDatabaseFromCsv(
  rows: CsvRow[],
  schema: DatasetSchema
): Promise<void> {
  const SQL = await getSqlJs();
  const sessionId = getCurrentSessionId();
  const store = getStore(sessionId);

  if (store.db) {
    store.db.close();
  }

  const db = new SQL.Database();
  const colDefs = schema.columns
    .map((col) => `${quoteIdentifier(col.name)} ${columnTypeToSqlite(col.type)}`)
    .join(', ');

  db.run(`DROP TABLE IF EXISTS ${DATASET_TABLE}`);
  db.run(`CREATE TABLE ${DATASET_TABLE} (${colDefs})`);

  const colNames = schema.columns.map((c) => quoteIdentifier(c.name));
  const placeholders = colNames.map(() => '?').join(', ');
  const insertSql = `INSERT INTO ${DATASET_TABLE} (${colNames.join(', ')}) VALUES (${placeholders})`;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const stmt = db.prepare(insertSql);
    try {
      for (const row of batch) {
        const values = schema.columns.map((col) => cellToSqlValue(row[col.name]));
        stmt.run(values);
      }
    } finally {
      stmt.free();
    }
  }

  store.db = db;
  store.schema = schema;

  const exported = db.export();
  await saveDatasetBlob(exported, sessionId);
}

async function inferSchemaFromBuffer(buffer: Uint8Array): Promise<DatasetSchema | null> {
  const SQL = await getSqlJs();
  const db = new SQL.Database(buffer);

  try {
    const tableInfo = db.exec(`PRAGMA table_info(${DATASET_TABLE})`);
    if (!tableInfo.length) {
      return null;
    }

    const columns = tableInfo[0].values.map((row) => ({
      name: String(row[1]),
      type: appTypeFromSqlite(String(row[2])),
    }));

    const countResult = db.exec(`SELECT COUNT(*) FROM ${DATASET_TABLE}`);
    const rowCount = countResult.length ? Number(countResult[0].values[0][0]) : 0;

    return {
      columns,
      rowCount,
      uploadedAt: new Date().toISOString(),
    };
  } finally {
    db.close();
  }
}

export async function ensureDatabaseReady(): Promise<boolean> {
  const sessionId = getCurrentSessionId();
  const store = getStore(sessionId);
  if (store.db && store.schema) {
    return true;
  }

  await hydrateDatasetFromStorage();

  if (!store.schema) {
    const dataset = getDataset();
    if (dataset?.schema) {
      store.schema = dataset.schema;
    }
  }

  const buffer = await loadDatasetBlob(sessionId);
  if (buffer) {
    if (!store.schema) {
      const inferredSchema = await inferSchemaFromBuffer(buffer);
      if (inferredSchema) {
        store.schema = inferredSchema;
        setDatasetSchema(inferredSchema);
      }
    }

    if (store.schema) {
      await importDatabase(buffer, store.schema);
      return true;
    }
  }

  return store.db !== null && store.schema !== null;
}

export function setCachedSchema(schema: DatasetSchema | null): void {
  getStore().schema = schema;
}

export async function clearDatabase(): Promise<void> {
  const sessionId = getCurrentSessionId();
  const store = getStore(sessionId);
  if (store.db) {
    store.db.close();
    store.db = null;
  }
  store.schema = null;
  await deleteAllDatasetStorage(sessionId);
}

export async function executeQuery(sql: string): Promise<QueryResultSet> {
  const ready = await ensureDatabaseReady();
  const store = getStore();

  if (!ready || !store.db) {
    throw new Error('No dataset loaded. Please upload a CSV file first.');
  }

  const validation = validateAndSanitizeSql(sql);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid SQL query.');
  }

  console.log('[SQL]', validation.sql);

  const results = store.db.exec(validation.sql);
  if (results.length === 0) {
    return { columns: [], rows: [], rowCount: 0 };
  }

  const result = results[0];
  const rows = rowsToObjects(result.columns, result.values);

  return {
    columns: result.columns,
    rows,
    rowCount: rows.length,
  };
}

export async function getDatasetDescription(): Promise<DatasetDescription | null> {
  const ready = await ensureDatabaseReady();
  const store = getStore();

  if (!ready || !store.db || !store.schema) {
    return null;
  }

  const tableInfo = store.db.exec(`PRAGMA table_info(${DATASET_TABLE})`);
  const columns =
    tableInfo.length > 0
      ? tableInfo[0].values.map((row) => {
          const name = String(row[1]);
          const sqlType = String(row[2]);
          const appType = store.schema!.columns.find((c) => c.name === name)?.type ?? appTypeFromSqlite(sqlType);
          return {
            name,
            type: appType,
            sqlType,
            quotedName: quoteIdentifier(name),
          };
        })
      : store.schema.columns.map((col) => ({
          name: col.name,
          type: col.type,
          sqlType: columnTypeToSqlite(col.type),
          quotedName: quoteIdentifier(col.name),
        }));

  const sampleResult = await executeQuery(`SELECT * FROM ${DATASET_TABLE} LIMIT 3`);

  const columnSummary = columns.map((c) => `${c.quotedName} (${c.sqlType}, app type: ${c.type})`).join(', ');

  return {
    tableName: DATASET_TABLE,
    rowCount: store.schema.rowCount,
    columns,
    sampleRows: sampleResult.rows,
    summary: `Table "${DATASET_TABLE}" has ${store.schema.rowCount} rows. Columns: ${columnSummary}. Always double-quote column names in SQL.`,
  };
}
