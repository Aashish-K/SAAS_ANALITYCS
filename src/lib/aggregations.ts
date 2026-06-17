import { CsvRow, CsvCellValue } from './data-store';
import { LineChartPoint, BarChartPoint, PieChartSlice, ScatterPoint } from './chart-types';

export type FilterValue = string | number | boolean | null;

export interface Filter {
  column: string;
  operator: 'eq' | 'neq' | 'contains' | 'gt' | 'lt' | 'gte' | 'lte' | 'between';
  value: FilterValue | FilterValue[];
}

export function filterRows(rows: CsvRow[], filters?: Filter[]): CsvRow[] {
  if (!filters || filters.length === 0) return rows;

  return rows.filter(row => {
    for (const filter of filters) {
      const cell = row[filter.column];
      const op = filter.operator;
      const fVal = filter.value;

      if (cell === undefined || cell === null) {
        if (op === 'neq') continue;
        return false;
      }

      const cellStr = String(cell).toLowerCase();

      if (op === 'eq') {
        const filterStr = String(fVal).toLowerCase();
        if (cellStr !== filterStr) return false;
      } else if (op === 'neq') {
        const filterStr = String(fVal).toLowerCase();
        if (cellStr === filterStr) return false;
      } else if (op === 'contains') {
        const filterStr = String(fVal).toLowerCase();
        if (!cellStr.includes(filterStr)) return false;
      } else if (op === 'gt') {
        if (Number(cell) <= Number(fVal)) return false;
      } else if (op === 'lt') {
        if (Number(cell) >= Number(fVal)) return false;
      } else if (op === 'gte') {
        if (Number(cell) < Number(fVal)) return false;
      } else if (op === 'lte') {
        if (Number(cell) > Number(fVal)) return false;
      } else if (op === 'between') {
        if (Array.isArray(fVal) && fVal.length === 2) {
          const [min, max] = fVal;
          if (min !== null && Number(cell) < Number(min)) return false;
          if (max !== null && Number(cell) > Number(max)) return false;
        } else {
          return false;
        }
      }
    }
    return true;
  });
}

function computeAggregation(values: number[], operation: 'sum' | 'count' | 'avg' | 'min' | 'max'): number {
  if (operation === 'count') return values.length;
  if (values.length === 0) return 0;

  switch (operation) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
    default:
      return 0;
  }
}

function extractNumericValues(rows: CsvRow[], col: string): number[] {
  return rows
    .map(r => r[col])
    .map(v => (v === null || v === undefined ? NaN : Number(v)))
    .filter(v => !isNaN(v));
}

export function groupAndAggregateForBar(
  rows: CsvRow[],
  groupByColumn: string,
  valueColumn: string,
  operation: 'sum' | 'count' | 'avg' | 'min' | 'max',
  filters?: Filter[]
): BarChartPoint[] {
  const filtered = filterRows(rows, filters);
  const groups: Record<string, CsvRow[]> = {};

  for (const row of filtered) {
    const rawVal = row[groupByColumn];
    const key = rawVal === null || rawVal === undefined ? 'Unknown' : String(rawVal);
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }

  return Object.entries(groups).map(([category, groupRows]) => {
    const vals = extractNumericValues(groupRows, valueColumn);
    const val = computeAggregation(vals, operation);
    const rounded = Math.round(val * 100) / 100;
    return { category, value: rounded };
  });
}

export function groupAndAggregateForPie(
  rows: CsvRow[],
  labelColumn: string,
  valueColumn: string,
  operation: 'sum' | 'count' | 'avg' | 'min' | 'max',
  filters?: Filter[]
): PieChartSlice[] {
  const filtered = filterRows(rows, filters);
  const groups: Record<string, CsvRow[]> = {};

  for (const row of filtered) {
    const rawVal = row[labelColumn];
    const key = rawVal === null || rawVal === undefined ? 'Unknown' : String(rawVal);
    if (!groups[key]) groups[key] = [];
    groups[key].push(row);
  }

  return Object.entries(groups).map(([label, groupRows]) => {
    const vals = extractNumericValues(groupRows, valueColumn);
    const val = computeAggregation(vals, operation);
    const rounded = Math.round(val * 100) / 100;
    return { label, value: rounded };
  });
}

export function groupAndAggregateForLine(
  rows: CsvRow[],
  xAxisColumn: string,
  yAxisColumn: string,
  operation: 'sum' | 'count' | 'avg' | 'min' | 'max',
  seriesColumn?: string,
  filters?: Filter[]
): LineChartPoint[] {
  const filtered = filterRows(rows, filters);

  interface GroupKey {
    x: string | number;
    series?: string;
  }

  const groups: Map<string, { key: GroupKey; rows: CsvRow[] }> = new Map();

  for (const row of filtered) {
    const rawX = row[xAxisColumn];
    const xVal = rawX === null || rawX === undefined ? 'Unknown' : rawX;

    let displayX = xVal;
    if (typeof xVal === 'string' && xVal.endsWith('Z') && !isNaN(Date.parse(xVal))) {
      displayX = xVal.split('T')[0];
    }

    const seriesVal = seriesColumn && row[seriesColumn] !== undefined && row[seriesColumn] !== null
      ? String(row[seriesColumn])
      : undefined;

    const mapKey = seriesVal ? `${displayX}__${seriesVal}` : String(displayX);

    if (!groups.has(mapKey)) {
      groups.set(mapKey, {
        key: {
          x: typeof displayX === 'string' || typeof displayX === 'number' ? displayX : String(displayX),
          series: seriesVal
        },
        rows: []
      });
    }
    groups.get(mapKey)!.rows.push(row);
  }

  const points: LineChartPoint[] = [];
  for (const group of groups.values()) {
    const vals = extractNumericValues(group.rows, yAxisColumn);
    const val = computeAggregation(vals, operation);
    const rounded = Math.round(val * 100) / 100;
    points.push({
      x: group.key.x,
      y: rounded,
      series: group.key.series
    });
  }

  points.sort((a, b) => {
    if (typeof a.x === 'number' && typeof b.x === 'number') {
      return a.x - b.x;
    }
    return String(a.x).localeCompare(String(b.x));
  });

  return points;
}

export function getScatterPoints(
  rows: CsvRow[],
  xAxisColumn: string,
  yAxisColumn: string,
  labelColumn?: string,
  filters?: Filter[]
): ScatterPoint[] {
  const filtered = filterRows(rows, filters);

  return filtered
    .map(row => {
      const xVal = row[xAxisColumn];
      const yVal = row[yAxisColumn];
      const label = labelColumn && row[labelColumn] !== undefined && row[labelColumn] !== null
        ? String(row[labelColumn])
        : undefined;

      if (xVal === null || xVal === undefined || yVal === null || yVal === undefined) {
        return null;
      }

      const xNum = Number(xVal);
      const yNum = Number(yVal);

      if (isNaN(xNum) || isNaN(yNum)) {
        return null;
      }

      return {
        x: xNum,
        y: yNum,
        label
      };
    })
    .filter(p => p !== null) as ScatterPoint[];
}
