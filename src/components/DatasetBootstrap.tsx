'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { hasBrowserDataset, syncBrowserDatasetToServer } from '@/lib/client/browser-dataset-storage';

export default function DatasetBootstrap() {
  const router = useRouter();
  const syncedRef = useRef(false);

  useEffect(() => {
    if (syncedRef.current || !hasBrowserDataset()) {
      return;
    }

    syncedRef.current = true;

    syncBrowserDatasetToServer()
      .then((ok) => {
        if (ok) {
          router.refresh();
        }
      })
      .catch(() => {
        syncedRef.current = false;
      });
  }, [router]);

  return null;
}
