'use client';

import React from 'react';
import { ChartData } from '@/lib/chart-types';
import {
  LineChartWidget,
  BarChartWidget,
  PieChartWidget,
  ScatterChartWidget,
} from './Charts';

function ChartWidget({ chart }: { chart: ChartData }) {
  switch (chart.type) {
    case 'line':
      return (
        <LineChartWidget
          data={chart.data}
          xAxisLabel={chart.xAxisLabel}
          yAxisLabel={chart.yAxisLabel}
          title={chart.title}
        />
      );
    case 'bar':
      return (
        <BarChartWidget
          data={chart.data}
          categoryLabel={chart.categoryLabel}
          valueLabel={chart.valueLabel}
          title={chart.title}
        />
      );
    case 'pie':
      return <PieChartWidget data={chart.data} title={chart.title} />;
    case 'scatter':
      return (
        <ScatterChartWidget
          data={chart.data}
          xAxisLabel={chart.xAxisLabel}
          yAxisLabel={chart.yAxisLabel}
          title={chart.title}
        />
      );
  }
}

export default function DashboardCharts({ charts }: { charts: ChartData[] }) {
  if (charts.length === 0) {
    return (
      <div className="chart-card">
        <h3 className="chart-title">Visualizations</h3>
        <div className="chart-placeholder">
          No meaningful charts could be generated for this dataset. Try asking the AI assistant for specific analysis.
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-grid">
      {charts.map((chart, i) => (
        <ChartWidget key={`${chart.title}-${i}`} chart={chart} />
      ))}
    </div>
  );
}
