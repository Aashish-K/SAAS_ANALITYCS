export type ColumnType = 'string' | 'number' | 'date' | 'boolean';

import { ChartData } from '@/lib/chart-types';

export interface ColumnSchema {
  name: string;
  type: ColumnType;
}

export interface DatasetSchema {
  columns: ColumnSchema[];
  rowCount: number;
  uploadedAt: string;
}

export type CsvCellValue = string | number | boolean | null;
export type CsvRow = Record<string, CsvCellValue>;

export interface Dataset {
  schema: DatasetSchema;
  dashboardMetrics?: DashboardMetric[];
  dashboardCharts?: ChartData[];
}

export interface DashboardMetric {
  label: string;
  value: string;
  subtext?: string;
  sql: string;
}

interface GlobalStore {
  dataset: Dataset | null;
  aiConfig: {
    modelId: string;
    temperature: number;
  };
}

const globalForStore = globalThis as unknown as { __datasetStore?: GlobalStore };

const store: GlobalStore = globalForStore.__datasetStore ?? {
  dataset: null,
  aiConfig: {
    modelId: 'meta/llama-3.1-405b-instruct',
    temperature: 0.2,
  },
};

if (process.env.NODE_ENV !== 'production') {
  globalForStore.__datasetStore = store;
}

export function setDatasetSchema(
  schema: DatasetSchema,
  dashboardMetrics?: DashboardMetric[],
  dashboardCharts?: ChartData[]
): void {
  store.dataset = { schema, dashboardMetrics, dashboardCharts };
}

export function setDashboardMetrics(metrics: DashboardMetric[]): void {
  if (store.dataset) {
    store.dataset.dashboardMetrics = metrics;
  }
}

export function getDataset(): Dataset | null {
  return store.dataset;
}

export function clearDataset(): void {
  store.dataset = null;
}

export function getAiConfig() {
  return store.aiConfig;
}

export function setAiConfig(modelId: string, temperature: number): void {
  store.aiConfig = { modelId, temperature };
}

// Legacy alias kept for gradual migration
export function setDataset(_rows: CsvRow[], schema: DatasetSchema): void {
  setDatasetSchema(schema);
}
