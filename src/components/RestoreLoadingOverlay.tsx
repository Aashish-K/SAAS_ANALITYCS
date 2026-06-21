'use client';

import { Loader2 } from 'lucide-react';
import { useBootstrap } from '@/context/BootstrapContext';

export default function RestoreLoadingOverlay() {
  const { isRestoringDataset } = useBootstrap();

  if (!isRestoringDataset) {
    return null;
  }

  return (
    <div className="restore-loading-overlay" role="status" aria-live="polite" aria-busy="true">
      <div className="restore-loading-card">
        <Loader2 className="spinner restore-loading-spinner" size={32} />
        <h2 className="restore-loading-title">Restoring your dataset</h2>
        <p className="restore-loading-text">Loading saved data from local storage…</p>
      </div>
    </div>
  );
}
