import {
  setDatasetSchema,
  hydrateDatasetFromStorage,
  persistDatasetToStorage,
} from '@/lib/data-store';
import { importDatabase, setCachedSchema } from '@/lib/db';
import { runWithKnownSession, resolveSessionId } from '@/lib/session';
import type { DashboardMetric, DatasetSchema } from '@/lib/data-store';
import type { ChartData } from '@/lib/chart-types';

export const dynamic = 'force-dynamic';

interface SyncDatasetBody {
  schema: DatasetSchema;
  dashboardMetrics?: DashboardMetric[];
  dashboardCharts?: ChartData[];
  sqliteBase64: string;
}

export async function POST(req: Request) {
  const sessionId = await resolveSessionId();

  try {
    const body = (await req.json()) as SyncDatasetBody;

    if (!body?.schema || !body?.sqliteBase64) {
      return Response.json({ error: 'Invalid dataset payload.' }, { status: 400 });
    }

    const buffer = Buffer.from(body.sqliteBase64, 'base64');

    await runWithKnownSession(sessionId, async () => {
      setDatasetSchema(body.schema, body.dashboardMetrics, body.dashboardCharts);
      setCachedSchema(body.schema);
      await importDatabase(new Uint8Array(buffer), body.schema);
      await persistDatasetToStorage();
    });

    const dataset = await runWithKnownSession(sessionId, () => hydrateDatasetFromStorage());

    return Response.json({
      ok: true,
      rowCount: dataset?.schema.rowCount ?? body.schema.rowCount,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to sync dataset';
    return Response.json({ error: msg }, { status: 500 });
  }
}
