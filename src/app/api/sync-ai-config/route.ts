import { setAiConfig } from '@/lib/data-store';
import { runWithKnownSession, resolveSessionId } from '@/lib/session';

export const dynamic = 'force-dynamic';

interface SyncAiConfigBody {
  modelId: string;
  temperature: number;
}

export async function POST(req: Request) {
  const sessionId = await resolveSessionId();

  try {
    const body = (await req.json()) as SyncAiConfigBody;

    if (
      !body?.modelId ||
      typeof body.modelId !== 'string' ||
      typeof body.temperature !== 'number' ||
      body.temperature < 0 ||
      body.temperature > 1
    ) {
      return Response.json({ error: 'Invalid AI config payload.' }, { status: 400 });
    }

    await runWithKnownSession(sessionId, async () => {
      setAiConfig(body.modelId.trim(), body.temperature);
    });

    return Response.json({ ok: true });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Failed to sync AI config';
    return Response.json({ error: msg }, { status: 500 });
  }
}
