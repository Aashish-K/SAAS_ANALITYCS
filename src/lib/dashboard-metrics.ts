import { createOpenAI } from '@ai-sdk/openai';
import { generateObject } from 'ai';
import { z } from 'zod';
import { getAiConfig, DatasetSchema, DashboardMetric } from '@/lib/data-store';
import { getDatasetDescription, executeQuery, ensureDatabaseReady } from '@/lib/db';
import { quoteSqlIdentifier } from '@/lib/db/result-formatter';
import { pickAnalysisColumns } from '@/lib/column-analysis';

type MetricDefinition = {
  label: string;
  sql: string;
  subtext?: string;
  format?: 'number' | 'currency' | 'percent' | 'integer' | 'text';
};

const metricDefsSchema = z.object({
  metrics: z
    .array(
      z.object({
        label: z
          .string()
          .describe('Short KPI title, e.g. "Total Revenue" or "Unique Customers"'),
        sql: z
          .string()
          .describe(
            'A SELECT query against the "dataset" table that returns exactly one row with one numeric or text value. Always double-quote column names.'
          ),
        subtext: z
          .string()
          .optional()
          .describe('Brief context line shown under the value, e.g. "across all regions"'),
        format: z
          .enum(['number', 'currency', 'percent', 'integer', 'text'])
          .optional()
          .describe('How to format the value for display'),
      })
    )
    .min(3)
    .max(4),
});

function formatMetricValue(
  raw: unknown,
  format: MetricDefinition['format'] = 'number'
): string {
  if (raw === null || raw === undefined) return '—';

  if (format === 'text') return String(raw);

  const num = Number(raw);
  if (isNaN(num)) return String(raw);

  switch (format) {
    case 'integer':
      return Math.round(num).toLocaleString();
    case 'currency':
      return num.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    case 'percent':
      return `${num.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
    case 'number':
    default:
      return Number.isInteger(num)
        ? num.toLocaleString()
        : num.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
}

async function executeMetricDefinition(def: MetricDefinition): Promise<DashboardMetric | null> {
  try {
    const result = await executeQuery(def.sql);
    if (result.rows.length === 0 || result.columns.length === 0) return null;

    const firstCol = result.columns[0];
    const raw = result.rows[0][firstCol];

    return {
      label: def.label,
      value: formatMetricValue(raw, def.format),
      subtext: def.subtext,
      sql: def.sql,
    };
  } catch {
    return null;
  }
}

async function executeMetricDefinitions(defs: MetricDefinition[]): Promise<DashboardMetric[]> {
  const results: DashboardMetric[] = [];
  for (const def of defs) {
    const metric = await executeMetricDefinition(def);
    if (metric) results.push(metric);
  }
  return results;
}

function buildFallbackDefinitions(schema: DatasetSchema): MetricDefinition[] {
  const q = quoteSqlIdentifier;
  const { catCol, numCol, dateCol } = pickAnalysisColumns(schema.columns);

  const defs: MetricDefinition[] = [
    {
      label: 'Total Records',
      sql: 'SELECT COUNT(*) FROM dataset',
      subtext: 'rows in dataset',
      format: 'integer',
    },
  ];

  if (numCol) {
    defs.push({
      label: `Total ${numCol.name}`,
      sql: `SELECT SUM(${q(numCol.name)}) FROM dataset`,
      subtext: `sum of ${numCol.name}`,
      format: 'number',
    });
    defs.push({
      label: `Average ${numCol.name}`,
      sql: `SELECT AVG(${q(numCol.name)}) FROM dataset`,
      subtext: `mean ${numCol.name}`,
      format: 'number',
    });
  }

  if (catCol) {
    defs.push({
      label: `Unique ${catCol.name}`,
      sql: `SELECT COUNT(DISTINCT ${q(catCol.name)}) FROM dataset`,
      subtext: `distinct ${catCol.name} values`,
      format: 'integer',
    });
  }

  if (dateCol && defs.length < 4) {
    defs.push({
      label: 'Date Range',
      sql: `SELECT COUNT(DISTINCT ${q(dateCol.name)}) FROM dataset`,
      subtext: `unique ${dateCol.name} values`,
      format: 'integer',
    });
  }

  return defs.slice(0, 4);
}

async function computeFallbackMetrics(): Promise<DashboardMetric[]> {
  await ensureDatabaseReady();
  const description = await getDatasetDescription();
  if (!description) return [];

  const dataset = await import('@/lib/data-store').then((m) => m.getDataset());
  if (!dataset) return [];

  const defs = buildFallbackDefinitions(dataset.schema);
  const metrics = await executeMetricDefinitions(defs);
  return metrics.length >= 3 ? metrics : metrics;
}

export async function generateDashboardMetrics(): Promise<DashboardMetric[]> {
  await ensureDatabaseReady();
  const description = await getDatasetDescription();
  if (!description) return [];

  const apiKey = process.env.NVIDIA_API_KEY || '';
  if (!apiKey || apiKey.trim() === '' || apiKey.startsWith('your_')) {
    return computeFallbackMetrics();
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

  const sampleJson = JSON.stringify(description.sampleRows.slice(0, 3), null, 2);

  try {
    const { object } = await generateObject({
      model: nvidia.chat(modelId),
      schema: metricDefsSchema,
      temperature: 0.2,
      prompt: `You are a data analyst. Given an uploaded CSV dataset, define exactly 3 or 4 key performance indicators (KPIs) that would be most insightful for a business dashboard.

Table name: dataset
Row count: ${description.rowCount}
Columns: ${columnList}

Sample rows:
${sampleJson}

Rules:
- Return exactly 3 or 4 metrics that are meaningful for THIS specific dataset (not generic metadata).
- Each metric SQL must return ONE row with ONE value (use aggregates like SUM, AVG, COUNT, MAX, MIN).
- Always double-quote column names in SQL.
- Pick metrics that highlight totals, averages, counts, top values, or rates relevant to the data domain.
- Use format "currency" for money columns, "percent" for rates, "integer" for counts, "number" for other numerics.
- Examples: total revenue, average order value, unique customers, highest sale, completion rate.`,
    });

    const metrics = await executeMetricDefinitions(object.metrics);

    if (metrics.length >= 3) {
      return metrics.slice(0, 4);
    }

    return computeFallbackMetrics();
  } catch (err) {
    console.error('[dashboard-metrics] LLM generation failed:', err);
    return computeFallbackMetrics();
  }
}
