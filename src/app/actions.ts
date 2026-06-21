'use server';

import Papa from 'papaparse';
import {
  setDatasetSchema,
  clearDataset,
  setAiConfig,
  ColumnSchema,
  DatasetSchema,
  CsvRow,
  ColumnType,
  persistDatasetToStorage,
} from '@/lib/data-store';
import { initDatabaseFromCsv, clearDatabase, setCachedSchema } from '@/lib/db';
import { generateDashboardMetrics } from '@/lib/dashboard-metrics';
import { generateDashboardCharts } from '@/lib/dashboard-charts';
import { isDateStr } from '@/lib/column-analysis';
import { revalidatePath } from 'next/cache';

function isBooleanStr(val: string): boolean {
  const v = val.trim().toLowerCase();
  return v === 'true' || v === 'false' || v === 'yes' || v === 'no';
}

function parseBoolean(val: string): boolean {
  const v = val.trim().toLowerCase();
  return v === 'true' || v === 'yes';
}

function isNumberStr(val: string): boolean {
  const v = val.trim();
  if (v === '') return false;
  const num = Number(v);
  return !isNaN(num) && isFinite(num);
}

function inferColumnType(values: string[], columnName: string): ColumnType {
  if (values.length === 0) return 'string';

  const booleanCount = values.filter(isBooleanStr).length;
  const numberCount = values.filter(isNumberStr).length;
  const dateCount = values.filter((v) => isDateStr(v, columnName)).length;
  const threshold = Math.ceil(values.length * 0.9);

  if (booleanCount === values.length) return 'boolean';
  if (numberCount >= threshold) return 'number';
  if (dateCount >= threshold) return 'date';
  return 'string';
}

export async function uploadCsvAction(formData: FormData) {
  try {
    const file = formData.get('file') as File;
    if (!file || file.size === 0) {
      return { success: false, error: 'No file uploaded or file is empty.' };
    }

    const text = await file.text();
    const parsed = Papa.parse(text, {
      header: true,
      skipEmptyLines: 'greedy',
    });

    if (parsed.errors && parsed.errors.length > 0 && parsed.data.length === 0) {
      return { success: false, error: `CSV parse errors: ${parsed.errors[0].message}` };
    }

    const rawRows = parsed.data as Record<string, string>[];
    if (rawRows.length === 0) {
      return { success: false, error: 'CSV file contains no data rows.' };
    }

    if (rawRows.length > 100000) {
      return { success: false, error: 'CSV file exceeds the 100,000 row limit.' };
    }

    const headers = Object.keys(rawRows[0] || {});
    if (headers.length === 0) {
      return { success: false, error: 'CSV file has no headers.' };
    }

    const columns: ColumnSchema[] = [];

    for (const header of headers) {
      const nonEmptyVals = rawRows
        .map((row) => row[header])
        .filter((val): val is string => val !== undefined && val !== null && val.trim() !== '');

      columns.push({ name: header, type: inferColumnType(nonEmptyVals, header) });
    }

    const parsedRows: CsvRow[] = rawRows.map((row) => {
      const parsedRow: CsvRow = {};
      for (const col of columns) {
        const rawVal = row[col.name];
        if (rawVal === undefined || rawVal === null || rawVal.trim() === '') {
          parsedRow[col.name] = null;
        } else {
          const valStr = rawVal.trim();
          if (col.type === 'number') {
            parsedRow[col.name] = Number(valStr);
          } else if (col.type === 'boolean') {
            parsedRow[col.name] = parseBoolean(valStr);
          } else if (col.type === 'date') {
            try {
              parsedRow[col.name] = new Date(valStr).toISOString();
            } catch {
              parsedRow[col.name] = valStr;
            }
          } else {
            parsedRow[col.name] = valStr;
          }
        }
      }
      return parsedRow;
    });

    const schema: DatasetSchema = {
      columns,
      rowCount: parsedRows.length,
      uploadedAt: new Date().toISOString(),
    };

    await initDatabaseFromCsv(parsedRows, schema);
    const [dashboardMetrics, dashboardCharts] = await Promise.all([
      generateDashboardMetrics(),
      generateDashboardCharts(),
    ]);
    setDatasetSchema(schema, dashboardMetrics, dashboardCharts);
    setCachedSchema(schema);
    await persistDatasetToStorage();

    revalidatePath('/dashboard');
    revalidatePath('/drill-down');
    revalidatePath('/settings');

    return { success: true, rowCount: parsedRows.length };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown upload error';
    return { success: false, error: msg };
  }
}

export async function clearDatasetAction() {
  await clearDatabase();
  clearDataset();
  revalidatePath('/dashboard');
  revalidatePath('/drill-down');
  revalidatePath('/settings');
  return { success: true };
}

export async function updateAiSettingsAction(modelId: string, temperature: number) {
  setAiConfig(modelId, temperature);
  revalidatePath('/settings');
  revalidatePath('/dashboard');
  revalidatePath('/drill-down');
  return { success: true };
}
