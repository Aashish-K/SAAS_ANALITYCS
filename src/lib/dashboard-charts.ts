import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { getAiConfig } from '@/lib/data-store';
import { getDatasetDescription, executeQuery, ensureDatabaseReady } from '@/lib/db';
import { formatQueryResult } from '@/lib/db/result-formatter';
import { buildSmartFallbackCharts } from '@/lib/column-analysis';
import { ChartData } from '@/lib/chart-types';

type ChartDefinition = {
  title: string;
  sql: string;
  chartType: 'line' | 'bar' | 'pie' | 'scatter';
};

const chartDefsSchema = z.object({
  charts: z
    .array(
      z.object({
        title: z.string().describe('Descriptive chart title relevant to the data domain'),
        sql: z
          .string()
          .describe(
            'SELECT query against "dataset" returning 2+ rows. Use GROUP BY for aggregations. Double-quote all column names. LIMIT results appropriately.'
          ),
        chartType: z
          .enum(['line', 'bar', 'pie', 'scatter'])
          .describe('line for time trends, bar for category comparisons, pie for part-to-whole (<=8 groups), scatter for two numeric variables'),
      })
    )
    .min(2)
    .max(4),
});

function isMeaningfulChart(chart: ChartData): boolean {
  if (chart.type === 'line') {
    if (chart.data.length < 2) return false;
    const ys = chart.data.map((d) => d.y);
    if (new Set(ys).size === 1 && ys[0] === 1) return false;
    return new Set(ys).size > 1;
  }
  if (chart.type === 'bar') {
    if (chart.data.length < 2) return false;
    const vals = chart.data.map((d) => d.value);
    if (new Set(vals).size === 1 && vals[0] === 1) return false;
    return new Set(vals).size > 1;
  }
  if (chart.type === 'pie') {
    if (chart.data.length < 2) return false;
    const vals = chart.data.map((d) => d.value);
    return vals.some((v) => v > 0) && new Set(vals).size > 1;
  }
  if (chart.type === 'scatter') {
    return chart.data.length >= 3;
  }
  return false;
}

async function executeChartDefinition(def: ChartDefinition): Promise<ChartData | null> {
  try {
    const result = await executeQuery(def.sql);
    if (result.rowCount < 2) return null;

    const formatted = formatQueryResult(
      result.columns,
      result.rows,
      def.title,
      false
    );

    if (formatted.kind !== 'chart') return null;

    // Respect LLM chart type preference when compatible
    const chart = formatted.chart;
    if (def.chartType === 'pie' && chart.type !== 'pie' && result.rowCount <= 8) {
      const xIdx = 0;
      const yIdx = 1;
      const xCol = result.columns[xIdx];
      const yCol = result.columns[yIdx];
      return {
        type: 'pie',
        data: result.rows.map((r) => ({
          label: String(r[xCol] ?? 'Unknown'),
          value: Number(r[yCol]) || 0,
        })),
        title: def.title,
      };
    }

    if (def.chartType === 'line' && chart.type === 'bar') {
      return {
        type: 'line',
        data: result.rows.map((r) => ({
          x: String(r[result.columns[0]] ?? ''),
          y: Number(r[result.columns[1]]) || 0,
        })),
        xAxisLabel: result.columns[0],
        yAxisLabel: result.columns[1],
        title: def.title,
      };
    }

    if (chart.type !== def.chartType && def.chartType === 'scatter' && result.columns.length >= 2) {
      const numCols = result.columns.filter((_, i) =>
        result.rows.some((r) => !isNaN(Number(r[result.columns[i]])))
      );
      if (numCols.length >= 2) {
        return {
          type: 'scatter',
          data: result.rows
            .filter((r) => !isNaN(Number(r[numCols[0]])) && !isNaN(Number(r[numCols[1]])))
            .map((r) => ({
              x: Number(r[numCols[0]]),
              y: Number(r[numCols[1]]),
            })),
          xAxisLabel: numCols[0],
          yAxisLabel: numCols[1],
          title: def.title,
        };
      }
    }

    chart.title = def.title;
    return isMeaningfulChart(chart) ? chart : null;
  } catch {
    return null;
  }
}

async function executeChartDefinitions(defs: ChartDefinition[]): Promise<ChartData[]> {
  const charts: ChartData[] = [];
  for (const def of defs) {
    const chart = await executeChartDefinition(def);
    if (chart) charts.push(chart);
  }
  return charts;
}

async function computeFallbackCharts(): Promise<ChartData[]> {
  await ensureDatabaseReady();
  const dataset = await import('@/lib/data-store').then((m) => m.getDataset());
  if (!dataset) return [];

  const defs = buildSmartFallbackCharts(dataset.schema);
  return executeChartDefinitions(defs);
}

export async function generateDashboardCharts(): Promise<ChartData[]> {
  await ensureDatabaseReady();
  const description = await getDatasetDescription();
  if (!description) return [];

  const apiKey = process.env.NVIDIA_API_KEY || '';
  if (!apiKey || apiKey.trim() === '' || apiKey.startsWith('your_')) {
    return computeFallbackCharts();
  }

  const config = getAiConfig();
  const modelId = process.env.NVIDIA_MODEL_ID || config.modelId || 'meta/llama-3.1-70b-instruct';

  const nvidia = createOpenAI({
    apiKey,
    baseURL: 'https://integrate.api.nvidia.com/v1',
  });

  const columnList = description.columns
    .map((c) => `${c.quotedName} (${c.sqlType}, app type: ${c.type})`)
    .join(', ');

  const sampleJson = JSON.stringify(description.sampleRows.slice(0, 5), null, 2);

  try {
    const { object } = await generateObject({
      model: nvidia.chat(modelId),
      schema: chartDefsSchema,
      temperature: 0.2,
      prompt: `You are a data visualization expert. Design 2-4 charts that reveal the most important insights for this uploaded CSV dataset.

Table name: dataset
Row count: ${description.rowCount}
Columns: ${columnList}

Sample rows:
${sampleJson}

CRITICAL RULES:
- NEVER use ID columns (columns named id, task_id, uuid, etc.) as chart dimensions — they produce meaningless 1-per-row counts.
- NEVER chart "count by unique identifier" — that is not insightful.
- Pick business-meaningful dimensions: status, category, region, assignee, priority, date, type, department, etc.
- Pick meaningful metrics: sums/averages of numeric columns like amount, hours, score, revenue, duration.
- line charts: group by a DATE column with a numeric aggregate (e.g. SUM of hours by due_date)
- bar charts: compare categories (e.g. COUNT or SUM grouped by status, region)
- pie charts: part-to-whole with <= 8 categories
- scatter: relationship between TWO numeric columns
- Each SQL must return multiple rows with variation — not one row per unique ID.
- Always double-quote column names in SQL.
- Add LIMIT 15-50 to prevent huge result sets.`,
    });

    const charts = await executeChartDefinitions(object.charts);
    if (charts.length >= 1) return charts.slice(0, 4);

    return computeFallbackCharts();
  } catch (err) {
    console.error('[dashboard-charts] LLM generation failed:', err);
    return computeFallbackCharts();
  }
}
