import { put, del, head } from '@vercel/blob';
import type { ChartData } from '@/lib/chart-types';
import type { DashboardMetric, DatasetSchema } from '@/lib/data-store';
import { getCurrentSessionId } from '@/lib/session';

export interface PersistedDatasetMetadata {
  schema: DatasetSchema;
  dashboardMetrics?: DashboardMetric[];
  dashboardCharts?: ChartData[];
}

function sqlitePath(sessionId: string): string {
  return `datasets/${sessionId}/current.sqlite`;
}

function metadataPath(sessionId: string): string {
  return `datasets/${sessionId}/metadata.json`;
}

export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function saveDatasetBlob(buffer: Uint8Array, sessionId?: string): Promise<void> {
  const id = sessionId ?? getCurrentSessionId();
  if (!isBlobConfigured()) {
    console.warn('[persistence] BLOB_READ_WRITE_TOKEN not set — dataset will only persist in warm server cache.');
    return;
  }

  await put(sqlitePath(id), Buffer.from(buffer), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function loadDatasetBlob(sessionId?: string): Promise<Uint8Array | null> {
  const id = sessionId ?? getCurrentSessionId();
  if (!isBlobConfigured()) {
    return null;
  }

  try {
    const blobMeta = await head(sqlitePath(id));
    if (!blobMeta?.url) {
      return null;
    }

    const response = await fetch(blobMeta.url);
    if (!response.ok) {
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch {
    return null;
  }
}

export async function saveDatasetMetadata(
  metadata: PersistedDatasetMetadata,
  sessionId?: string
): Promise<void> {
  const id = sessionId ?? getCurrentSessionId();
  if (!isBlobConfigured()) {
    console.warn('[persistence] BLOB_READ_WRITE_TOKEN not set — metadata will only persist in warm server cache.');
    return;
  }

  await put(metadataPath(id), JSON.stringify(metadata), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}

export async function loadDatasetMetadata(sessionId?: string): Promise<PersistedDatasetMetadata | null> {
  const id = sessionId ?? getCurrentSessionId();
  if (!isBlobConfigured()) {
    return null;
  }

  try {
    const blobMeta = await head(metadataPath(id));
    if (!blobMeta?.url) {
      return null;
    }

    const response = await fetch(blobMeta.url);
    if (!response.ok) {
      return null;
    }

    return (await response.json()) as PersistedDatasetMetadata;
  } catch {
    return null;
  }
}

export async function deleteDatasetBlob(sessionId?: string): Promise<void> {
  const id = sessionId ?? getCurrentSessionId();
  if (!isBlobConfigured()) {
    return;
  }

  try {
    await del(sqlitePath(id));
  } catch {
    // Blob may not exist yet
  }
}

export async function deleteDatasetMetadata(sessionId?: string): Promise<void> {
  const id = sessionId ?? getCurrentSessionId();
  if (!isBlobConfigured()) {
    return;
  }

  try {
    await del(metadataPath(id));
  } catch {
    // Blob may not exist yet
  }
}

export async function deleteAllDatasetStorage(sessionId?: string): Promise<void> {
  await Promise.all([deleteDatasetBlob(sessionId), deleteDatasetMetadata(sessionId)]);
}
