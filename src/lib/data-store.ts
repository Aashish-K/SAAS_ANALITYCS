export type ColumnType = 'string' | 'number' | 'date' | 'boolean';

import { ChartData } from '@/lib/chart-types';
import { loadDatasetMetadata, saveDatasetMetadata } from '@/lib/db/persistence';
import { getCurrentSessionId } from '@/lib/session';

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

interface SessionData {
  dataset: Dataset | null;
  aiConfig: {
    modelId: string;
    temperature: number;
  };
}

interface GlobalStoreState {
  sessions: Map<string, SessionData>;
  hydrating: Map<string, Promise<Dataset | null>>;
}

const globalForStore = globalThis as unknown as { __datasetStoreState?: GlobalStoreState };

function getStoreState(): GlobalStoreState {
  if (!globalForStore.__datasetStoreState) {
    globalForStore.__datasetStoreState = {
      sessions: new Map(),
      hydrating: new Map(),
    };
  }
  return globalForStore.__datasetStoreState;
}

function getSessionData(sessionId: string): SessionData {
  const state = getStoreState();
  let session = state.sessions.get(sessionId);
  if (!session) {
    session = {
      dataset: null,
      aiConfig: {
        modelId: 'meta/llama-3.1-405b-instruct',
        temperature: 0.2,
      },
    };
    state.sessions.set(sessionId, session);
  }
  return session;
}

export function setDatasetSchema(
  schema: DatasetSchema,
  dashboardMetrics?: DashboardMetric[],
  dashboardCharts?: ChartData[]
): void {
  const session = getSessionData(getCurrentSessionId());
  session.dataset = { schema, dashboardMetrics, dashboardCharts };
}

export function getDataset(): Dataset | null {
  return getSessionData(getCurrentSessionId()).dataset;
}

export async function hydrateDatasetFromStorage(): Promise<Dataset | null> {
  const sessionId = getCurrentSessionId();
  const session = getSessionData(sessionId);

  if (session.dataset) {
    return session.dataset;
  }

  const state = getStoreState();
  let hydrating = state.hydrating.get(sessionId);
  if (!hydrating) {
    hydrating = (async () => {
      const metadata = await loadDatasetMetadata(sessionId);
      if (metadata?.schema) {
        session.dataset = {
          schema: metadata.schema,
          dashboardMetrics: metadata.dashboardMetrics,
          dashboardCharts: metadata.dashboardCharts,
        };
      }
      return session.dataset;
    })().finally(() => {
      state.hydrating.delete(sessionId);
    });
    state.hydrating.set(sessionId, hydrating);
  }

  return hydrating;
}

export async function persistDatasetToStorage(): Promise<void> {
  const sessionId = getCurrentSessionId();
  const session = getSessionData(sessionId);
  if (!session.dataset) {
    return;
  }

  await saveDatasetMetadata(
    {
      schema: session.dataset.schema,
      dashboardMetrics: session.dataset.dashboardMetrics,
      dashboardCharts: session.dataset.dashboardCharts,
    },
    sessionId
  );
}

export function clearDataset(): void {
  const sessionId = getCurrentSessionId();
  getSessionData(sessionId).dataset = null;
}

export function getAiConfig() {
  return getSessionData(getCurrentSessionId()).aiConfig;
}

export function setAiConfig(modelId: string, temperature: number): void {
  const session = getSessionData(getCurrentSessionId());
  session.aiConfig = { modelId, temperature };
}
