const DB_NAME = 'packing-video-manager';
const DB_VERSION = 1;
const STORE = 'pending-uploads';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface PendingUpload {
  captureId: string;
  orderCode: string;
  recordedAt: string;
  mime: string;
  filename: string;
  blob: Blob;
  savedAt: number;
}

export type PendingUploadInput = Omit<PendingUpload, 'savedAt'>;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB is unavailable'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error ?? new Error('Could not open local storage'));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'captureId' });
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function runTransaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = run(tx.objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Local storage request failed'));
        tx.onerror = () => reject(tx.error ?? new Error('Local storage transaction failed'));
        tx.oncomplete = () => db.close();
      }),
  );
}

export async function savePendingUpload(entry: PendingUploadInput): Promise<void> {
  const record: PendingUpload = { ...entry, savedAt: Date.now() };
  await runTransaction('readwrite', (store) => store.put(record));
}

export async function removePendingUpload(captureId: string): Promise<void> {
  await runTransaction('readwrite', (store) => store.delete(captureId));
}

export async function listPendingUploads(): Promise<PendingUpload[]> {
  if (typeof indexedDB === 'undefined') return [];
  try {
    const db = await openDb();
    const cutoff = Date.now() - MAX_AGE_MS;
    return await new Promise<PendingUpload[]>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (!cursor) {
          const all = store.getAll();
          all.onsuccess = () => {
            const items = (all.result as PendingUpload[]).sort((a, b) => b.savedAt - a.savedAt);
            resolve(items);
          };
          all.onerror = () => reject(all.error ?? new Error('Could not read local uploads'));
          return;
        }
        const value = cursor.value as PendingUpload;
        if (value.savedAt < cutoff) cursor.delete();
        cursor.continue();
      };
      cursorRequest.onerror = () => reject(cursorRequest.error ?? new Error('Could not scan local uploads'));
      tx.oncomplete = () => db.close();
      tx.onerror = () => reject(tx.error ?? new Error('Local storage transaction failed'));
    });
  } catch {
    return [];
  }
}

export function pendingStorageErrorMessage(reason: unknown): string {
  if (reason instanceof DOMException && reason.name === 'QuotaExceededError') {
    return 'Bộ nhớ trình duyệt đã đầy. Hãy tải video lên hoặc xóa bản tạm trước khi quay tiếp.';
  }
  return 'Không lưu được bản sao tạm trên thiết bị. Tránh tải lại trang cho đến khi tải lên xong.';
}
