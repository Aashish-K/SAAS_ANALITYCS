import { ColumnSchema, ColumnType } from '@/lib/data-store';
import { quoteSqlIdentifier } from '@/lib/db/result-formatter';

const ID_NAME_PATTERN =
  /(^|_|\s)(id|uuid|guid|key|code|ref|sku|task.?id|order.?id|customer.?id)(s?)$/i;

export function isIdLikeColumn(name: string): boolean {
  const normalized = name.trim();
  if (ID_NAME_PATTERN.test(normalized)) return true;
  if (/^[A-Za-z]+[\s_-]?id$/i.test(normalized)) return true;
  if (/^id$/i.test(normalized)) return true;
  return false;
}

export function isLikelyIdentifierValue(val: string): boolean {
  const v = val.trim();
  if (!v) return false;
  if (/^[A-Za-z]+-\d+$/i.test(v)) return true;
  if (/^[A-Za-z]{1,5}\d{3,}$/i.test(v)) return true;
  if (/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(v)) return true;
  return false;
}

export function isDateStr(val: string, columnName?: string): boolean {
  if (columnName && isIdLikeColumn(columnName)) return false;

  const v = val.trim();
  if (!v || !isNaN(Number(v))) return false;
  if (isLikelyIdentifierValue(v)) return false;

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

export function inferColumnType(values: string[], columnName: string): ColumnType {
  if (values.length === 0) return 'string';

  if (isIdLikeColumn(columnName)) return 'string';

  const idLikeRatio = values.filter(isLikelyIdentifierValue).length / values.length;
  if (idLikeRatio >= 0.8) return 'string';

  const booleanCount = values.filter((v) => {
    const lower = v.trim().toLowerCase();
    return lower === 'true' || lower === 'false' || lower === 'yes' || lower === 'no';
  }).length;

  const numberCount = values.filter((v) => {
    const trimmed = v.trim();
    if (trimmed === '') return false;
    const num = Number(trimmed);
    return !isNaN(num) && isFinite(num);
  }).length;

  const dateCount = values.filter((v) => isDateStr(v, columnName)).length;
  const threshold = Math.ceil(values.length * 0.9);

  if (booleanCount === values.length) return 'boolean';
  if (numberCount >= threshold) return 'number';
  if (dateCount >= threshold) return 'date';
  return 'string';
}

export function pickAnalyticalColumns(columns: ColumnSchema[]) {
  const numeric = columns.filter((c) => c.type === 'number' && !isIdLikeColumn(c.name));
  const dates = columns.filter((c) => c.type === 'date' && !isIdLikeColumn(c.name));
  const categorical = columns.filter(
    (c) => c.type === 'string' && !isIdLikeColumn(c.name)
  );

  return {
    numeric,
    dates,
    categorical,
    bestNumeric: numeric[0]?.name,
    bestDate: dates[0]?.name,
    bestCategory: categorical[0]?.name,
    secondNumeric: numeric[1]?.name,
  };
}

export function buildSmartFallbackChartSql(
  chartType: 'line' | 'bar' | 'pie' | 'scatter',
  columns: ColumnSchema[]
): { sql: string; title: string } | null {
  const q = quoteSqlIdentifier;
  const { bestNumeric, bestDate, bestCategory, secondNumeric } =
    pickAnalyticalColumns(columns);

  switch (chartType) {
    case 'line':
      if (bestDate && bestNumeric) {
        return {
          sql: `SELECT ${q(bestDate)}, SUM(${q(bestNumeric)}) AS value FROM dataset GROUP BY 1 ORDER BY 1 LIMIT 50`,
          title: `${bestNumeric} over time`,
        };
      }
      if (bestCategory && bestNumeric) {
        return {
          sql: `SELECT ${q(bestCategory)}, SUM(${q(bestNumeric)}) AS value FROM dataset GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
          title: `${bestNumeric} by ${bestCategory}`,
        };
      }
      if (bestCategory) {
        return {
          sql: `SELECT ${q(bestCategory)}, COUNT(*) AS value FROM dataset GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
          title: `Records by ${bestCategory}`,
        };
      }
      return null;

    case 'bar':
      if (bestCategory && bestNumeric) {
        return {
          sql: `SELECT ${q(bestCategory)}, SUM(${q(bestNumeric)}) AS value FROM dataset GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
          title: `Total ${bestNumeric} by ${bestCategory}`,
        };
      }
      if (bestCategory) {
        return {
          sql: `SELECT ${q(bestCategory)}, COUNT(*) AS value FROM dataset GROUP BY 1 ORDER BY 2 DESC LIMIT 15`,
          title: `Count by ${bestCategory}`,
        };
      }
      return null;

    case 'pie':
      if (bestCategory && bestNumeric) {
        return {
          sql: `SELECT ${q(bestCategory)}, SUM(${q(bestNumeric)}) AS value FROM dataset GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
          title: `Share of ${bestNumeric} by ${bestCategory}`,
        };
      }
      if (bestCategory) {
        return {
          sql: `SELECT ${q(bestCategory)}, COUNT(*) AS value FROM dataset GROUP BY 1 ORDER BY 2 DESC LIMIT 8`,
          title: `Distribution by ${bestCategory}`,
        };
      }
      return null;

    case 'scatter':
      if (bestNumeric && secondNumeric) {
        return {
          sql: `SELECT ${q(bestNumeric)} AS x, ${q(secondNumeric)} AS y${bestCategory ? `, ${q(bestCategory)} AS label` : ''} FROM dataset WHERE ${q(bestNumeric)} IS NOT NULL AND ${q(secondNumeric)} IS NOT NULL LIMIT 500`,
          title: `${secondNumeric} vs ${bestNumeric}`,
        };
      }
      return null;

    default:
      return null;
  }
}
