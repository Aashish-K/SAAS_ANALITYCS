import { ColumnSchema, DatasetSchema } from '@/lib/data-store';

const ID_COLUMN_PATTERN =
  /(^|_|\s)(id|uuid|guid|key|code|ref|nummer|number|task\s*id|record\s*id)($|_|\s)/i;

const ID_VALUE_PATTERN = /^[A-Za-z]+[-_]?\d+$/i;

export function isIdLikeColumn(name: string): boolean {
  const normalized = name.trim();
  if (/^id$/i.test(normalized)) return true;
  if (/_id$/i.test(normalized)) return true;
  if (/^id_/i.test(normalized)) return true;
  return ID_COLUMN_PATTERN.test(normalized);
}

export function isLikelyIdentifierValue(val: string): boolean {
  const v = val.trim();
  if (ID_VALUE_PATTERN.test(v)) return true;
  if (/^T-\d+/i.test(v)) return true;
  return false;
}

export function isStrictDateStr(val: string): boolean {
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
    /^[A-Za-z]{3,9}\s+\d{1,2}/i.test(v)
  );
}

export function pickAnalysisColumns(schema: DatasetSchema): {
  numeric: ColumnSchema[];
  categorical: ColumnSchema[];
  temporal: ColumnSchema[];
} {
  const numeric = schema.columns.filter((c) => c.type === 'number' && !isIdLikeColumn(c.name));
  const temporal = schema.columns.filter((c) => c.type === 'date' && !isIdLikeColumn(c.name));
  const categorical = schema.columns.filter(
    (c) =>
      (c.type === 'string' || c.type === 'boolean') &&
      !isIdLikeColumn(c.name) &&
      !/date|time|created|updated|timestamp/i.test(c.name)
  );

  return { numeric, categorical, temporal };
}

export function scoreCategoricalColumn(name: string): number {
  const n = name.toLowerCase();
  let score = 0;
  if (/status|state|stage|phase/i.test(n)) score += 10;
  if (/category|type|class|group|segment|department|team|region|country|city|priority|severity|level/i.test(n)) score += 8;
  if (/name|title|label/i.test(n)) score += 3;
  if (isIdLikeColumn(name)) score -= 100;
  return score;
}

export function scoreNumericColumn(name: string): number {
  const n = name.toLowerCase();
  let score = 0;
  if (/amount|revenue|sales|price|cost|total|value|score|rating|hours|duration|quantity|count|age|salary|budget/i.test(n)) score += 10;
  if (isIdLikeColumn(name)) score -= 100;
  return score;
}

export function scoreTemporalColumn(name: string): number {
  const n = name.toLowerCase();
  let score = 0;
  if (/date|time|created|updated|timestamp|month|year|period/i.test(n)) score += 10;
  if (isIdLikeColumn(name)) score -= 100;
  return score;
}

export function bestColumn(columns: ColumnSchema[], scorer: (name: string) => number): ColumnSchema | undefined {
  if (columns.length === 0) return undefined;
  return [...columns].sort((a, b) => scorer(b.name) - scorer(a.name))[0];
}
