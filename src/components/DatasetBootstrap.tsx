'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useBootstrap } from '@/context/BootstrapContext';
import {
  hasBrowserDataset,
  syncBrowserDatasetToServer,
} from '@/lib/client/browser-dataset-storage';
import {
  loadBrowserAiConfig,
  syncBrowserAiConfigToServer,
} from '@/lib/client/browser-ai-config-storage';

export default function AppBootstrap() {
  const router = useRouter();
  const { setIsRestoringDataset } = useBootstrap();
  const bootstrappedRef = useRef(false);

  useEffect(() => {
    if (bootstrappedRef.current) {
      return;
    }
    bootstrappedRef.current = true;

    let cancelled = false;

    async function bootstrap() {
      let shouldRefresh = false;

      const aiConfig = loadBrowserAiConfig();
      if (aiConfig) {
        try {
          const synced = await syncBrowserAiConfigToServer();
          if (synced) {
            shouldRefresh = true;
          }
        } catch {
          // keep going — dataset restore may still succeed
        }
      }

      if (hasBrowserDataset()) {
        setIsRestoringDataset(true);

        try {
          const synced = await syncBrowserDatasetToServer();
          if (!cancelled && synced) {
            shouldRefresh = true;
          }
        } catch {
          // fall through to hide loading state
        } finally {
          if (!cancelled) {
            setIsRestoringDataset(false);
          }
        }
      }

      if (!cancelled && shouldRefresh) {
        router.refresh();
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
      setIsRestoringDataset(false);
    };
  }, [router, setIsRestoringDataset]);

  return null;
}
