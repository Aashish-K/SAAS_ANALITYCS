import { createOpenAI } from '@ai-sdk/openai';
import {
  streamText,
  tool,
  stepCountIs,
  convertToModelMessages,
} from 'ai';
import { hydrateDatasetFromStorage, getAiConfig } from '@/lib/data-store';
import { getDatasetDescription, executeQuery, ensureDatabaseReady } from '@/lib/db';
import { formatQueryResult } from '@/lib/db/result-formatter';
import { runWithKnownSession, resolveSessionId } from '@/lib/session';
import { z } from 'zod';
import { QueryResult } from '@/lib/chart-types';

export const dynamic = 'force-dynamic';

const describeDatasetSchema = z.object({});
type DescribeDatasetInput = z.infer<typeof describeDatasetSchema>;

interface DescribeDatasetResult {
  tableName?: string;
  rowCount?: number;
  columns?: Array<{ name: string; type: string; sqlType: string; quotedName: string }>;
  sampleRows?: Record<string, unknown>[];
  summary: string;
  error?: string;
}

const runSqlQuerySchema = z.object({
  sql: z.string().describe('A read-only SQL SELECT query against the "dataset" table. Always double-quote column names that contain spaces or special characters.'),
  title: z.string().optional().describe('Optional descriptive title for the result visualization.'),
  preferTable: z.boolean().optional().describe('Set to true when the user wants to see raw rows in a table rather than a chart.'),
});
type RunSqlQueryInput = z.infer<typeof runSqlQuerySchema>;

interface RunSqlQueryResult {
  columns?: string[];
  rowCount?: number;
  visualization?: QueryResult;
  summary: string;
  error?: string;
}

export async function POST(req: Request) {
  const sessionId = await resolveSessionId();

  try {
    const body = await req.json();
    const { messages } = body;

    const { config, dataset, dbReady } = await runWithKnownSession(sessionId, async () => {
      const dataset = await hydrateDatasetFromStorage();
      const dbReady = dataset ? await ensureDatabaseReady() : false;
      return { config: getAiConfig(), dataset, dbReady };
    });

    const modelId = process.env.NVIDIA_MODEL_ID || config.modelId || 'meta/llama-3.1-70b-instruct';
    const temp = config.temperature;
    const apiKey = process.env.NVIDIA_API_KEY || '';

    if (!apiKey || apiKey.trim() === '' || apiKey.startsWith('your_')) {
      return new Response(
        JSON.stringify({
          error: 'AI querying requires NVIDIA_API_KEY. Upload and schema preview still work without it.',
        }),
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const nvidia = createOpenAI({
      apiKey,
      baseURL: 'https://integrate.api.nvidia.com/v1',
    });

      const systemPrompt = `You are the AI Analytics assistant.
You help users analyze their uploaded CSV dataset by writing SQL queries and answering natural language questions.

CRITICAL RULES:
1. Always base your answers on actual SQL query results. NEVER guess, hallucinate, or fabricate numbers.
2. The data lives in a single SQLite table named "dataset". If you do not know the schema, call "describeDataset" first.
3. For each user question, call "runSqlQuery" at most once with the correct SQL. Never repeat the same query across multiple steps.
4. Always double-quote column names in SQL (e.g. SELECT "Region", AVG("Revenue") FROM dataset GROUP BY 1).
5. Use SQL aggregate functions directly: COUNT(*), SUM(), AVG(), MIN(), MAX() — do NOT try to compute aggregates yourself.
6. Use REPLACE(column, ',', '') before CAST when numeric columns contain comma-formatted values (e.g. CAST(REPLACE("_5", ',', '') AS REAL)).
7. For row lookups use: SELECT * FROM dataset WHERE ... LIMIT 50
8. For aggregations use: SELECT "category_col", AVG("numeric_col") FROM dataset GROUP BY 1 ORDER BY 2 DESC
9. Set preferTable=true when the user asks to "show", "list", or "display" rows.
10. When runSqlQuery returns a visualization (chart, table, or scalar), do NOT add a follow-up text response. The UI renders the result directly — repeating rows, columns, or values in prose is redundant.
11. Only write a markdown response when no visualization tool was used (e.g. schema questions answered via describeDataset, or when no dataset is uploaded).
12. If no dataset is uploaded, politely ask the user to upload a CSV file.

Current dataset status: ${
        dataset && dbReady
          ? `A dataset is uploaded with ${dataset.schema.rowCount} rows. Columns: ${dataset.schema.columns.map((c) => `${c.name} (${c.type})`).join(', ')}.`
          : 'No dataset is currently uploaded.'
      }`;

      const modelMessages = await convertToModelMessages(messages);

      const result = streamText({
        model: nvidia.chat(modelId),
        messages: modelMessages,
        system: systemPrompt,
        temperature: temp,
        maxOutputTokens: 4096,
        stopWhen: stepCountIs(3),
        tools: {
          describeDataset: tool<DescribeDatasetInput, DescribeDatasetResult>({
            description: 'Inspect the schema, column types, sample rows, and row count of the uploaded dataset.',
            inputSchema: describeDatasetSchema,
          execute: async (): Promise<DescribeDatasetResult> => {
            return runWithKnownSession(sessionId, async () => {
              const ready = await ensureDatabaseReady();
              if (!ready) {
                return {
                  summary: 'No dataset uploaded.',
                  error: 'No dataset has been uploaded yet. Please tell the user to upload a CSV file.',
                };
              }

              const description = await getDatasetDescription();
              if (!description) {
                return { summary: 'Failed to read dataset schema.', error: 'Could not read dataset schema.' };
              }

              return {
                tableName: description.tableName,
                rowCount: description.rowCount,
                columns: description.columns,
                sampleRows: description.sampleRows as Record<string, unknown>[],
                summary: description.summary,
              };
            });
          },
          }),
          runSqlQuery: tool<RunSqlQueryInput, RunSqlQueryResult>({
            description: 'Execute a read-only SQL SELECT query against the dataset table and return formatted results for charts or tables.',
            inputSchema: runSqlQuerySchema,
          execute: async ({ sql, title, preferTable }): Promise<RunSqlQueryResult> => {
            return runWithKnownSession(sessionId, async () => {
              const ready = await ensureDatabaseReady();
              if (!ready) {
                return {
                  summary: 'No dataset uploaded.',
                  error: 'No dataset has been uploaded yet. Please tell the user to upload a CSV file.',
                };
              }

              try {
                const result = await executeQuery(sql);
                const visualization = formatQueryResult(
                  result.columns,
                  result.rows,
                  title,
                  preferTable ?? false
                );

                return {
                  columns: result.columns,
                  rowCount: result.rowCount,
                  visualization,
                  summary: `Query returned ${result.rowCount} row(s) with columns: ${result.columns.join(', ')}.`,
                };
              } catch (err: unknown) {
                const msg = err instanceof Error ? err.message : 'Unknown query error';
                return {
                  summary: 'Query failed.',
                  error: `SQL execution failed: ${msg}`,
                };
              }
            });
          },
          }),
        },
      });

    return result.toUIMessageStreamResponse({
      onError: (error: unknown) => {
        const errMsg = error instanceof Error ? error.message : String(error);
        return errMsg;
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Unknown chat error';
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
