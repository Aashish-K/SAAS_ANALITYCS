export interface LineChartPoint {
  x: string | number;
  y: number;
  series?: string;
}

export interface BarChartPoint {
  category: string;
  value: number;
}

export interface PieChartSlice {
  label: string;
  value: number;
}

export interface ScatterPoint {
  x: number;
  y: number;
  label?: string;
}

export type ChartData =
  | { type: 'line'; data: LineChartPoint[]; xAxisLabel?: string; yAxisLabel?: string; title?: string }
  | { type: 'bar'; data: BarChartPoint[]; categoryLabel?: string; valueLabel?: string; title?: string }
  | { type: 'pie'; data: PieChartSlice[]; title?: string }
  | { type: 'scatter'; data: ScatterPoint[]; xAxisLabel?: string; yAxisLabel?: string; title?: string };

export type QueryResult =
  | { kind: 'chart'; chart: ChartData }
  | { kind: 'table'; columns: string[]; rows: Record<string, unknown>[]; title?: string }
  | { kind: 'scalar'; value: string | number; label?: string };
