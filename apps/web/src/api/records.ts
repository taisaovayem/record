export interface PackingRecord {
  id: string;
  orderCode: string;
  recordedAt: string;
  mimeType: string;
  originalName: string;
}

export interface RecordPage {
  items: PackingRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface BulkDeleteResult {
  deletedIds: string[];
  failures: { id: string; reason: string }[];
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

export async function listRecords(page: number, limit: number, search: string): Promise<RecordPage> {
  const query = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search.trim()) query.set('search', search.trim());
  return checked(await fetch(`${apiBase}/records?${query}`));
}

export function uploadRecord(orderCode: string, blob: Blob, filename: string, captureId: string, recordedAt: string, onProgress: (percent: number) => void): Promise<PackingRecord> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `${apiBase}/records`);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round(event.loaded / event.total * 100));
    };
    request.onerror = () => reject(new Error('Không thể kết nối máy chủ. Video vẫn được giữ để thử tải lại.'));
    request.onload = () => {
      if (request.status === 401) window.dispatchEvent(new Event('packing-auth-expired'));
      let body: { message?: string } & Partial<PackingRecord> = {};
      try { body = JSON.parse(request.responseText) as typeof body; } catch { /* handled below */ }
      if (request.status < 200 || request.status >= 300) {
        reject(new Error(body.message ?? `Không lưu được video (${request.status}). Video vẫn được giữ để thử lại.`));
        return;
      }
      resolve(body as PackingRecord);
    };
    const form = new FormData();
    form.append('orderCode', orderCode);
    form.append('captureId', captureId);
    form.append('recordedAt', recordedAt);
    form.append('video', blob, filename);
    request.send(form);
  });
}

export async function deleteRecords(ids: string[]): Promise<BulkDeleteResult> {
  return checked(await fetch(`${apiBase}/records/bulk`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
  }));
}

export function downloadUrl(id: string): string {
  return `${apiBase}/records/${encodeURIComponent(id)}/download`;
}
