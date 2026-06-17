'use client';

import React, { useEffect } from 'react';
import { useDashboard } from '@/context/DashboardContext';
import { ChartData } from '@/lib/chart-types';
import {
  LineChartWidget,
  BarChartWidget,
  PieChartWidget,
  ScatterChartWidget,
} from './Charts';
import { RefreshCw, Trash2 } from 'lucide-react';

export default function DrillDownContainer({ initialCharts }: { initialCharts: ChartData[] }) {
  const { drillDownCharts, setDrillDownCharts, clearDrillDownCharts } = useDashboard();

  useEffect(() => {
    setDrillDownCharts(initialCharts);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCharts]);

  const handleReset = () => {
    setDrillDownCharts(initialCharts);
  };

  const displayedCharts = drillDownCharts.length > 0 ? drillDownCharts : initialCharts;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '1rem',
          flexWrap: 'wrap',
          gap: '1rem',
        }}
      >
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            Active Analytical Drill-Down Views ({displayedCharts.length})
          </h2>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={handleReset}
            className="btn btn-secondary"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
          >
            <RefreshCw size={14} />
            <span>Reset to Defaults</span>
          </button>
          <button
            onClick={clearDrillDownCharts}
            className="btn btn-secondary"
            style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem', color: 'var(--error)' }}
          >
            <Trash2 size={14} />
            <span>Clear All</span>
          </button>
        </div>
      </div>

      <div className="dashboard-grid">
        {displayedCharts.map((chart, idx) => {
          const key = `${chart.type}-${chart.title || idx}-${idx}`;
          return (
            <div key={key}>
              {chart.type === 'line' && (
                <LineChartWidget
                  data={chart.data}
                  xAxisLabel={chart.xAxisLabel}
                  yAxisLabel={chart.yAxisLabel}
                  title={chart.title}
                />
              )}
              {chart.type === 'bar' && (
                <BarChartWidget
                  data={chart.data}
                  categoryLabel={chart.categoryLabel}
                  valueLabel={chart.valueLabel}
                  title={chart.title}
                />
              )}
              {chart.type === 'pie' && (
                <PieChartWidget
                  data={chart.data}
                  title={chart.title}
                />
              )}
              {chart.type === 'scatter' && (
                <ScatterChartWidget
                  data={chart.data}
                  xAxisLabel={chart.xAxisLabel}
                  yAxisLabel={chart.yAxisLabel}
                  title={chart.title}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
