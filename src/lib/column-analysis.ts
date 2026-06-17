import { ColumnSchema, DatasetSchema } from '@/lib/data-store';
import { quoteSqlIdentifier } from '@/lib/db/result-formatter';

const ID_COLUMN_PATTERN = /(^|_)(id|uuid|key|ref|code|sku|task.?id|order.?id|customer.?id)(s?)$/i;
const ID_VALUE_PATTERN = /^[A-Za-z]+[-_]?\d+$/i;

export function isIdLikeColumn(name: string): boolean {
  const n = name.trim();
  return ID_COLUMN_PATTERN.test(n) || n.toLowerCase() === 'id';
}

export function isIdLikeValue(val: string): boolean {
  return ID_VALUE_PATTERN.test(val.trim());
}

export function isDateStr(val: string, columnName?: string): boolean {
  if (columnName && isIdLikeColumn(columnName)) return false;

  const v = val.trim();
  if (v === '' || !isNaN(Number(v))) return false;
  if (isIdLikeValue(v)) return false;

  const timestamp = Date.parse(v);
  if (isNaN(timestamp)) return false;

  const year = new Date(timestamp).getFullYear();
  if (year < 1990 || year > 2100) return false;

  return (
    v.includes('-') ||
    v.includes('/') ||
    v.includes('.') ||
    v.includes(',') ||
    v.includes(':') ||
    /^[A-Za-z]{3}\s/i.test(v)
  );
}

export function pickAnalysisColumns(columns: ColumnSchema[]) {
  const numeric = columns.filter((c) => c.type === 'number' && !isIdLikeColumn(c.name));
  const dates = columns.filter((c) => c.type === 'date' && !isIdLikeColumn(c.name));
  const categories = columns.filter(
    (c) => c.type === 'string' && !isIdLikeColumn(c.name)
  );

  const catCol =
    categories.find((c) => /status|category|type|region|country|department|priority|assignee|owner|team/i.test(c.name)) ||
    categories[0];

  const numCol =
    numeric.find((c) => /amount|revenue|price|cost|total|value|score|hours|quantity|count|duration/i.test(c.name)) ||
    numeric[0];

  const dateCol =
    dates.find((c) => /date|time|created|updated|due|start|end|month|year/i.test(c.name)) ||
    dates[0];

  const secondNumCol = numeric.find((c) => c.name !== numCol?.name);

  return { catCol, numCol, dateCol, secondNumCol };
}

export function buildSmartFallbackCharts(schema: DatasetSchema | ColumnSchema[]): Array<{
  title: string;
  sql: string;
  chartType: 'line' | 'bar' | 'pie' | 'scatter';
}> {
  const q = quoteSqlIdentifier;
  const columns = Array.isArray(schema) ? schema : schema.columns;
  const { catCol, numCol, dateCol, secondNumCol } = pickAnalysisColumns(columns);
  const charts: Array<{ title: string; sql: string; chartType: 'line' | 'bar' | 'pie' | 'scatter' }> = [];

  if (catCol && numCol) {
    charts.push({
      title: `${numCol.name} by ${catCol.name}`,
      sql: `SELECT ${q(catCol.name)}, SUM(${q(numCol.name)}) AS value FROM dataset GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
      chartType: 'bar',
    });
    charts.push({
      title: `Share of ${numCol.name} by ${catCol.name}`,
      sql: `SELECT ${q(catCol.name)}, SUM(${q(numCol.name)}) AS value FROM dataset GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
      chartType: 'pie',
    });
  } else if (catCol) {
    charts.push({
      title: `Records by ${catCol.name}`,
      sql: `SELECT ${q(catCol.name)}, COUNT(*) AS value FROM dataset GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
      chartType: 'bar',
    });
    charts.push({
      title: `Distribution by ${catCol.name}`,
      sql: `SELECT ${q(catCol.name)}, COUNT(*) AS value FROM dataset GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
      chartType: 'pie',
    });
  }

  if (dateCol && numCol) {
    charts.push({
      title: `${numCol.name} over time`,
      sql: `SELECT ${q(dateCol.name)}, SUM(${q(numCol.name)}) AS value FROM dataset GROUP BY 1 ORDER BY 1 LIMIT 50`,
      chartType: 'line',
    });
  } else if (dateCol && catCol) {
    charts.push({
      title: `Activity by ${dateCol.name}`,
      sql: `SELECT ${q(dateCol.name)}, COUNT(*) AS value FROM dataset GROUP BY 1 ORDER BY 1 LIMIT 50`,
      chartType: 'line',
    });
  }

  if (numCol && secondNumCol) {
    charts.push({
      title: `${secondNumCol.name} vs ${numCol.name}`,
      sql: `SELECT ${q(numCol.name)} AS x, ${q(secondNumCol.name)} AS y FROM dataset WHERE ${q(numCol.name)} IS NOT NULL AND ${q(secondNumCol.name)} IS NOT NULL LIMIT 300`,
      chartType: 'scatter',
    });
  }

  return charts.slice(0, 4);
}
