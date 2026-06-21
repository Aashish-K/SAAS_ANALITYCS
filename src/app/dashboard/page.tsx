import React from 'react';
import { hydrateDatasetFromStorage } from '@/lib/data-store';
import UploadForm from '@/components/UploadForm';
import DataTable from '@/components/DataTable';
import DashboardCharts from '@/components/DashboardCharts';
import { ensureDatabaseReady, executeQuery } from '@/lib/db';
import { generateDashboardMetrics } from '@/lib/dashboard-metrics';
import { generateDashboardCharts } from '@/lib/dashboard-charts';
import { runWithSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  return runWithSession(async () => {
    const dataset = await hydrateDatasetFromStorage();

    if (!dataset) {
      return (
        <div className="main-layout">
          <main className="content-area flex flex-col justify-center items-center">
            <div className="page-title-section text-center" style={{ textAlign: 'center', marginBottom: '2rem' }}>
              <h1 className="page-title">AI Analytics Dashboard</h1>
              <p className="page-subtitle">Upload your business data to begin exploring insights with AI</p>
            </div>
            <UploadForm />
          </main>
        </div>
      );
    }

    await ensureDatabaseReady();

    const { schema, dashboardMetrics: storedMetrics, dashboardCharts: storedCharts } = dataset;

    const [dashboardMetrics, dashboardCharts] = await Promise.all([
      storedMetrics && storedMetrics.length >= 3
        ? Promise.resolve(storedMetrics)
        : generateDashboardMetrics(),
      storedCharts && storedCharts.length >= 1
        ? Promise.resolve(storedCharts)
        : generateDashboardCharts(),
    ]);

    let previewData: { columns: string[]; rows: Record<string, unknown>[] } | null = null;
    try {
      const preview = await executeQuery('SELECT * FROM dataset LIMIT 25');
      previewData = { columns: preview.columns, rows: preview.rows as Record<string, unknown>[] };
    } catch {
      previewData = null;
    }

    return (
      <div className="main-layout">
        <main className="content-area">
          <div className="page-title-section">
            <h1 className="page-title">AI Analytics Overview</h1>
            <p className="page-subtitle">AI-selected KPIs and charts tailored to your uploaded dataset</p>
          </div>

          <div className="metrics-row">
            {dashboardMetrics.map((metric, i) => (
              <div key={i} className="metric-card">
                <span className="metric-label">{metric.label}</span>
                <span className="metric-value">{metric.value}</span>
                {metric.subtext && (
                  <span className="metric-subtext">{metric.subtext}</span>
                )}
              </div>
            ))}
          </div>

          <DashboardCharts charts={dashboardCharts} />

          {previewData && (
            <div className="data-preview-section">
              <h2 className="section-title">Data Preview</h2>
              <p className="section-subtitle">First 25 rows from your uploaded dataset</p>
              <DataTable
                columns={previewData.columns}
                rows={previewData.rows}
                title="Dataset Preview"
              />
            </div>
          )}
        </main>
      </div>
    );
  });
}
