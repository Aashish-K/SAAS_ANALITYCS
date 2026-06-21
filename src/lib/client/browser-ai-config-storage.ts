const BROWSER_AI_CONFIG_KEY = 'sd_ai_config';

export interface BrowserAiConfig {
  modelId: string;
  temperature: number;
}

export function loadBrowserAiConfig(): BrowserAiConfig | null {
  if (typeof window === 'undefined') return null;

  const raw = localStorage.getItem(BROWSER_AI_CONFIG_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as BrowserAiConfig;
    if (
      typeof parsed.modelId === 'string' &&
      parsed.modelId.trim() !== '' &&
      typeof parsed.temperature === 'number' &&
      parsed.temperature >= 0 &&
      parsed.temperature <= 1
    ) {
      return {
        modelId: parsed.modelId.trim(),
        temperature: parsed.temperature,
      };
    }
  } catch {
    // ignore invalid stored config
  }

  return null;
}

export function saveBrowserAiConfig(config: BrowserAiConfig): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(BROWSER_AI_CONFIG_KEY, JSON.stringify(config));
}

export async function syncBrowserAiConfigToServer(): Promise<boolean> {
  const config = loadBrowserAiConfig();
  if (!config) return false;

  const response = await fetch('/api/sync-ai-config', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  });

  return response.ok;
}
