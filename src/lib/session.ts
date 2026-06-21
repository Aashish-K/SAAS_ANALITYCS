import { AsyncLocalStorage } from 'async_hooks';
import { cookies } from 'next/headers';
import { randomUUID } from 'crypto';

import { SESSION_COOKIE } from '@/lib/session-constants';

const sessionContext = new AsyncLocalStorage<string>();

function isValidSessionId(id: string): boolean {
  return /^[0-9a-f-]{36}$/i.test(id);
}

export function getCurrentSessionId(): string {
  const sessionId = sessionContext.getStore();
  if (!sessionId) {
    throw new Error('Session context not initialized. Wrap server code in runWithSession().');
  }
  return sessionId;
}

export async function resolveSessionId(): Promise<string> {
  const cookieStore = await cookies();
  const existing = cookieStore.get(SESSION_COOKIE)?.value;
  if (existing && isValidSessionId(existing)) {
    return existing;
  }

  const sessionId = randomUUID();
  cookieStore.set(SESSION_COOKIE, sessionId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
  return sessionId;
}

export async function runWithSession<T>(fn: () => Promise<T>): Promise<T> {
  const sessionId = await resolveSessionId();
  return runWithKnownSession(sessionId, fn);
}

export async function runWithKnownSession<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
  return sessionContext.run(sessionId, fn);
}
