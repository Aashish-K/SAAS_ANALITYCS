import React from 'react';
import { getDataset } from '@/lib/data-store';
import ChatSidebar from '@/components/ChatSidebar';
import DrillDownContainer from '@/components/DrillDownContainer';
import { ensureDatabaseReady } from '@/lib/db';
import { generateDashboardCharts } from '@/lib/dashboard-charts';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DrillDownPage() {
  const dataset = getDataset();

  if (!dataset) {
    return (
      <div className="drill-down-layout">
        <main className="content-area flex flex-col justify-center items-center">
          <div className="page-title-section" style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 className="page-title">Interactive Drill-Down Canvas</h1>
            <p className="page-subtitle">
              No dataset is currently uploaded. Please upload a CSV first to start drill-down analysis.
            </p>
            <div style={{ marginTop: '2rem' }}>
              <Link href="/dashboard" className="btn">
                Go to Dashboard Upload
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  await ensureDatabaseReady();

  const initialCharts =
    dataset.dashboardCharts && dataset.dashboardCharts.length > 0
      ? dataset.dashboardCharts
      : await generateDashboardCharts();

  return (
    <div className="drill-down-layout">
      <main className="content-area">
        <div className="page-title-section">
          <h1 className="page-title">Interactive Drill-Down Canvas</h1>
          <p className="page-subtitle">
            Review the summary chart below, then ask the assistant to drill down for more detail.
          </p>
        </div>

        <DrillDownContainer initialCharts={initialCharts} />

        {initialCharts.length > 0 && (
          <div className="drill-down-chat-section">
            <ChatSidebar />
          </div>
        )}
      </main>
    </div>
  );
}
