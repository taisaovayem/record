export interface RetentionSettings {
  autoDeleteRecordsEnabled: boolean;
  autoDeleteRecordsAfterDays: number;
  purgeVideosEnabled: boolean;
  purgeVideosAfterDays: number;
}

const apiBase = (import.meta.env.VITE_API_BASE_URL ?? '/api').replace(/\/$/, '');

async function checked<T>(response: Response): Promise<T> {
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('packing-auth-expired'));
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? `Yêu cầu thất bại (${response.status})`);
  }
  return response.json() as Promise<T>;
}

export async function getRetentionSettings(): Promise<RetentionSettings> {
  return checked(await fetch(`${apiBase}/settings/retention`, { credentials: 'include' }));
}

export async function saveRetentionSettings(settings: RetentionSettings): Promise<RetentionSettings> {
  return checked(await fetch(`${apiBase}/settings/retention`, {
    method: 'PUT',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      autoDeleteRecordsEnabled: settings.autoDeleteRecordsEnabled,
      autoDeleteRecordsAfterDays: settings.autoDeleteRecordsAfterDays,
      purgeVideosEnabled: settings.purgeVideosEnabled,
      purgeVideosAfterDays: settings.purgeVideosAfterDays,
    }),
  }));
}
