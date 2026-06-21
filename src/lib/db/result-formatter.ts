import { ChartData, QueryResult } from '@/lib/chart-types';
import { SqlValue } from 'sql.js';

function isNumericValue(val: SqlValue): boolean {
  if (val === null || val === undefined) return false;
  if (typeof val === 'number') return !isNaN(val);
  const num = Number(val);
  return !isNaN(num) && val !== '';
}

function isDateLike(val: SqlValue): boolean {
  if (val === null || val === undefined) return false;
  const str = String(val);
  if (!isNaN(Number(str))) return false;
  return !isNaN(Date.parse(str));
}

function formatDateDisplay(val: SqlValue): string {
  if (val === null || val === undefined) return 'Unknown';
  const str = String(val);
  if (str.endsWith('Z') && !isNaN(Date.parse(str))) {
    return str.split('T')[0];
  }
  const parsed = Date.parse(str);
  if (!isNaN(parsed)) {
    return new Date(parsed).toISOString().split('T')[0];
  }
  return str;
}

function toNumber(val: SqlValue): number {
  if (typeof val === 'number') return val;
  return Number(val);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function classifyColumns(columns: string[], rows: Record<string, SqlValue>[]) {
  const types = columns.map((col) => {
    const sample = rows.find((r) => r[col] !== null && r[col] !== undefined)?.[col];
    if (sample === undefined) return 'unknown';
    if (isDateLike(sample)) return 'date';
    if (isNumericValue(sample)) return 'number';
    return 'text';
  });
  return types;
}

export function formatQueryResult(
  columns: string[],
  rows: Record<string, SqlValue>[],
  title?: string,
  preferTable = false
): QueryResult {
  if (rows.length === 0) {
    return {
      kind: 'table',
      columns,
      rows: rows as Record<string, unknown>[],
      title: title || 'Query Results (empty)',
    };
  }

  if (rows.length === 1 && columns.length === 1) {
    const val = rows[0][columns[0]];
    return {
      kind: 'scalar',
      value: val === null || val === undefined ? '—' : typeof val === 'number' ? round2(val) : String(val),
      label: columns[0],
    };
  }

  const colTypes = classifyColumns(columns, rows);

  if (!preferTable && columns.length === 2) {
    const xIdx = colTypes.findIndex((t) => t === 'text' || t === 'date');
    const yIdx = colTypes.findIndex((t) => t === 'number');

    if (xIdx !== -1 && yIdx !== -1 && xIdx !== yIdx) {
      const xCol = columns[xIdx];
      const yCol = columns[yIdx];

      if (rows.length <= 8 && colTypes[xIdx] === 'text') {
        const pieData = rows.map((r) => ({
          label: String(r[xCol] ?? 'Unknown'),
          value: round2(toNumber(r[yCol])),
        }));
        const chart: ChartData = {
          type: 'pie',
          data: pieData,
          title: title || `${yCol} by ${xCol}`,
        };
        return { kind: 'chart', chart };
      }

      if (colTypes[xIdx] === 'date' || rows.length > 8) {
        const lineData = rows.map((r) => ({
          x: colTypes[xIdx] === 'date' ? formatDateDisplay(r[xCol]) : String(r[xCol] ?? 'Unknown'),
          y: round2(toNumber(r[yCol])),
        }));
        const chart: ChartData = {
          type: 'line',
          data: lineData,
          xAxisLabel: xCol,
          yAxisLabel: yCol,
          title: title || `${yCol} by ${xCol}`,
        };
        return { kind: 'chart', chart };
      }

      const barData = rows.map((r) => ({
        category: String(r[xCol] ?? 'Unknown'),
        value: round2(toNumber(r[yCol])),
      }));
      const chart: ChartData = {
        type: 'bar',
        data: barData,
        categoryLabel: xCol,
        valueLabel: yCol,
        title: title || `${yCol} by ${xCol}`,
      };
      return { kind: 'chart', chart };
    }
  }

  if (!preferTable && columns.length >= 2) {
    const numCols = columns.filter((_, i) => colTypes[i] === 'number');
    if (numCols.length >= 2 && rows.length > 1) {
      const xCol = numCols[0];
      const yCol = numCols[1];
      const labelCol = columns.find((_, i) => colTypes[i] === 'text');

      const scatterData = rows
        .filter((r) => isNumericValue(r[xCol]) && isNumericValue(r[yCol]))
        .map((r) => ({
          x: toNumber(r[xCol]),
          y: toNumber(r[yCol]),
          label: labelCol ? String(r[labelCol] ?? '') : undefined,
        }));

      if (scatterData.length > 0) {
        const chart: ChartData = {
          type: 'scatter',
          data: scatterData,
          xAxisLabel: xCol,
          yAxisLabel: yCol,
          title: title || `${yCol} vs ${xCol}`,
        };
        return { kind: 'chart', chart };
      }
    }
  }

  return {
    kind: 'table',
    columns,
    rows: rows as Record<string, unknown>[],
    title: title || 'Query Results',
  };
}

export function quoteSqlIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
