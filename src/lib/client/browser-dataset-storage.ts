import type { ChartData } from '@/lib/chart-types';
import type { DashboardMetric, DatasetSchema } from '@/lib/data-store';

const BROWSER_DATASET_META_KEY = 'sd_dataset_meta';

export interface BrowserDatasetMeta {
  schema: DatasetSchema;
  dashboardMetrics?: DashboardMetric[];
  dashboardCharts?: ChartData[];
  savedAt: string;
}

export interface BrowserDatasetBundle extends BrowserDatasetMeta {
  sqliteBase64: string;
}

const DB_NAME = 'saas-dashboard';
const DB_VERSION = 1;
const SQLITE_STORE = 'sqlite';
const SQLITE_KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SQLITE_STORE)) {
        db.createObjectStore(SQLITE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function idbGet<T>(storeName: string, key: string): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly');
        const request = tx.objectStore(storeName).get(key);
        request.onerror = () => reject(request.error ?? new Error('IndexedDB read failed'));
        request.onsuccess = () => resolve((request.result as T | undefined) ?? null);
      })
  );
}

function idbSet(storeName: string, key: string, value: ArrayBuffer): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
        tx.objectStore(storeName).put(value, key);
      })
  );
}

function idbDelete(storeName: string, key: string): Promise<void> {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB delete failed'));
        tx.objectStore(storeName).delete(key);
      })
  );
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function hasBrowserDataset(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(BROWSER_DATASET_META_KEY) !== null;
}

export async function saveBrowserDataset(bundle: BrowserDatasetBundle): Promise<void> {
  const { sqliteBase64, ...meta } = bundle;
  const metaPayload: BrowserDatasetMeta = {
    ...meta,
    savedAt: meta.savedAt || new Date().toISOString(),
  };

  localStorage.setItem(BROWSER_DATASET_META_KEY, JSON.stringify(metaPayload));
  await idbSet(SQLITE_STORE, SQLITE_KEY, base64ToArrayBuffer(sqliteBase64));
}

async function loadBrowserDataset(): Promise<BrowserDatasetBundle | null> {
  if (typeof window === 'undefined') return null;

  const rawMeta = localStorage.getItem(BROWSER_DATASET_META_KEY);
  if (!rawMeta) return null;

  try {
    const meta = JSON.parse(rawMeta) as BrowserDatasetMeta;
    const sqliteBuffer = await idbGet<ArrayBuffer>(SQLITE_STORE, SQLITE_KEY);
    if (!sqliteBuffer) return null;

    return {
      ...meta,
      sqliteBase64: arrayBufferToBase64(sqliteBuffer),
    };
  } catch {
    return null;
  }
}

export async function clearBrowserDataset(): Promise<void> {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(BROWSER_DATASET_META_KEY);
  await idbDelete(SQLITE_STORE, SQLITE_KEY);
}

export async function syncBrowserDatasetToServer(): Promise<boolean> {
  const bundle = await loadBrowserDataset();
  if (!bundle) return false;

  const response = await fetch('/api/sync-dataset', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schema: bundle.schema,
      dashboardMetrics: bundle.dashboardMetrics,
      dashboardCharts: bundle.dashboardCharts,
      sqliteBase64: bundle.sqliteBase64,
    }),
  });

  return response.ok;
}
