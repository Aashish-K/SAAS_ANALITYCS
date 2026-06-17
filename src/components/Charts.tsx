'use client';

import React, { useState, useEffect } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from 'recharts';
import { LineChartPoint, BarChartPoint, PieChartSlice, ScatterPoint } from '@/lib/chart-types';

const COLORS = [
  '#6366f1', // Indigo
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#8b5cf6', // Violet
  '#ef4444', // Red
];

// Helper to check mount state to prevent hydration error
function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

interface ChartContainerProps {
  title?: string;
  children: React.ReactNode;
}

function ChartContainer({ title, children }: ChartContainerProps) {
  return (
    <div className="chart-card">
      {title && <h3 className="chart-title">{title}</h3>}
      <div className="chart-wrapper">
        {children}
      </div>
    </div>
  );
}

export function LineChartWidget({
  data,
  xAxisLabel,
  yAxisLabel,
  title,
}: {
  data: LineChartPoint[];
  xAxisLabel?: string;
  yAxisLabel?: string;
  title?: string;
}) {
  const mounted = useMounted();
  if (!mounted) return <div className="chart-placeholder">Loading line chart...</div>;

  if (!data || data.length === 0) {
    return <div className="chart-placeholder">No data available for Line Chart</div>;
  }

  // Pivot data for multiple series support
  const uniqueSeries = Array.from(new Set(data.map(p => p.series).filter((s): s is string => !!s)));
  const uniqueX = Array.from(new Set(data.map(p => p.x)));

  // Sort x values if numeric or date string
  uniqueX.sort((a, b) => {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b));
  });

  const chartData = uniqueX.map(xVal => {
    const row: Record<string, string | number> = { name: xVal };
    if (uniqueSeries.length > 0) {
      for (const s of uniqueSeries) {
        const match = data.find(p => p.x === xVal && p.series === s);
        row[s] = match ? match.y : 0;
      }
    } else {
      const match = data.find(p => p.x === xVal);
      row['value'] = match ? match.y : 0;
    }
    return row;
  });

  return (
    <ChartContainer title={title || 'Line Chart Trend'}>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
          <XAxis
            dataKey="name"
            stroke="rgba(255,255,255,0.5)"
            fontSize={12}
            tickLine={false}
            label={xAxisLabel ? { value: xAxisLabel, position: 'bottom', offset: 0, fill: 'rgba(255,255,255,0.6)' } : undefined}
          />
          <YAxis
            stroke="rgba(255,255,255,0.5)"
            fontSize={12}
            tickLine={false}
            label={yAxisLabel ? { value: yAxisLabel, angle: -90, position: 'insideLeft', offset: 0, fill: 'rgba(255,255,255,0.6)' } : undefined}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: '#fff',
            }}
          />
          <Legend wrapperStyle={{ paddingTop: 10 }} />
          {uniqueSeries.length > 0 ? (
            uniqueSeries.map((s, idx) => (
              <Line
                key={s}
                type="monotone"
                dataKey={s}
                stroke={COLORS[idx % COLORS.length]}
                strokeWidth={3}
                activeDot={{ r: 6 }}
                dot={{ r: 3, strokeWidth: 1 }}
              />
            ))
          ) : (
            <Line
              type="monotone"
              dataKey="value"
              name="Value"
              stroke={COLORS[0]}
              strokeWidth={3}
              activeDot={{ r: 6 }}
              dot={{ r: 3, strokeWidth: 1 }}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

export function BarChartWidget({
  data,
  categoryLabel,
  valueLabel,
  title,
}: {
  data: BarChartPoint[];
  categoryLabel?: string;
  valueLabel?: string;
  title?: string;
}) {
  const mounted = useMounted();
  if (!mounted) return <div className="chart-placeholder">Loading bar chart...</div>;

  if (!data || data.length === 0) {
    return <div className="chart-placeholder">No data available for Bar Chart</div>;
  }

  return (
    <ChartContainer title={title || 'Bar Chart Breakdown'}>
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
          <defs>
            <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#4f46e5" stopOpacity={0.4} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" vertical={false} />
          <XAxis
            dataKey="category"
            stroke="rgba(255,255,255,0.5)"
            fontSize={12}
            tickLine={false}
            label={categoryLabel ? { value: categoryLabel, position: 'bottom', offset: 0, fill: 'rgba(255,255,255,0.6)' } : undefined}
          />
          <YAxis
            stroke="rgba(255,255,255,0.5)"
            fontSize={12}
            tickLine={false}
            label={valueLabel ? { value: valueLabel, angle: -90, position: 'insideLeft', offset: 0, fill: 'rgba(255,255,255,0.6)' } : undefined}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: '#fff',
            }}
          />
          <Bar dataKey="value" name={valueLabel || 'Value'} fill="url(#barGradient)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

export function PieChartWidget({
  data,
  title,
}: {
  data: PieChartSlice[];
  title?: string;
}) {
  const mounted = useMounted();
  if (!mounted) return <div className="chart-placeholder">Loading pie chart...</div>;

  if (!data || data.length === 0) {
    return <div className="chart-placeholder">No data available for Pie Chart</div>;
  }

  // Filter out any slices with zero or negative values to prevent rendering issues
  const validData = data.filter(d => d.value > 0);

  if (validData.length === 0) {
    return <div className="chart-placeholder">All category values are 0 or empty</div>;
  }

  return (
    <ChartContainer title={title || 'Pie Chart Share'}>
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={validData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, percent }) => `${name}: ${percent !== undefined ? (percent * 100).toFixed(0) : '0'}%`}
            outerRadius={90}
            fill="#8884d8"
            dataKey="value"
            nameKey="label"
          >
            {validData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: '#fff',
            }}
          />
          <Legend layout="horizontal" verticalAlign="bottom" align="center" />
        </PieChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}

export function ScatterChartWidget({
  data,
  xAxisLabel,
  yAxisLabel,
  title,
}: {
  data: ScatterPoint[];
  xAxisLabel?: string;
  yAxisLabel?: string;
  title?: string;
}) {
  const mounted = useMounted();
  if (!mounted) return <div className="chart-placeholder">Loading scatter chart...</div>;

  if (!data || data.length === 0) {
    return <div className="chart-placeholder">No data available for Scatter Chart</div>;
  }

  return (
    <ChartContainer title={title || 'Scatter Distribution'}>
      <ResponsiveContainer width="100%" height={300}>
        <ScatterChart margin={{ top: 10, right: 20, left: 10, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.07)" />
          <XAxis
            type="number"
            dataKey="x"
            name={xAxisLabel || 'X Axis'}
            stroke="rgba(255,255,255,0.5)"
            fontSize={12}
            tickLine={false}
            label={{ value: xAxisLabel || 'X Axis', position: 'bottom', offset: 0, fill: 'rgba(255,255,255,0.6)' }}
          />
          <YAxis
            type="number"
            dataKey="y"
            name={yAxisLabel || 'Y Axis'}
            stroke="rgba(255,255,255,0.5)"
            fontSize={12}
            tickLine={false}
            label={{ value: yAxisLabel || 'Y Axis', angle: -90, position: 'insideLeft', offset: 0, fill: 'rgba(255,255,255,0.6)' }}
          />
          <Tooltip
            cursor={{ strokeDasharray: '3 3' }}
            contentStyle={{
              backgroundColor: 'rgba(15, 23, 42, 0.95)',
              borderColor: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: '#fff',
            }}
            formatter={(value, name, props) => {
              if (name === 'x') return [value, xAxisLabel || 'X'];
              if (name === 'y') return [value, yAxisLabel || 'Y'];
              return [value, name];
            }}
            labelFormatter={(label, items) => {
              const payload = items[0]?.payload as ScatterPoint | undefined;
              return payload?.label ? `Point: ${payload.label}` : '';
            }}
          />
          <Scatter name="Distribution" data={data} fill="#06b6d4">
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
