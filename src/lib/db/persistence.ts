import { put, del, head } from '@vercel/blob';

const BLOB_PATHNAME = 'datasets/current.sqlite';

export function isBlobConfigured(): boolean {
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN);
}

export async function saveDatasetBlob(buffer: Uint8Array): Promise<void> {
  if (!isBlobConfigured()) {
    console.warn('[persistence] BLOB_READ_WRITE_TOKEN not set — dataset will only persist in warm server cache.');
    return;
  }

  await put(BLOB_PATHNAME, Buffer.from(buffer), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
  });
}

export async function loadDatasetBlob(): Promise<Uint8Array | null> {
  if (!isBlobConfigured()) {
    return null;
  }

  try {
    const blobMeta = await head(BLOB_PATHNAME);
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

export async function deleteDatasetBlob(): Promise<void> {
  if (!isBlobConfigured()) {
    return;
  }

  try {
    await del(BLOB_PATHNAME);
  } catch {
    // Blob may not exist yet
  }
}
