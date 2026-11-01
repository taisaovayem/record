import { useCallback, useEffect, useState } from 'react';
import { uploadRecord } from '../api/records';
import { listPendingUploads, removePendingUpload, type PendingUpload } from '../pendingUploads';

interface Props {
  refreshKey: number;
  onUploaded: () => void;
}

const formatDate = (value: string) =>
  new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export default function PendingUploadsBanner({ refreshKey, onUploaded }: Props) {
  const [items, setItems] = useState<PendingUpload[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    void listPendingUploads()
      .then((pending) => setItems(pending))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [refreshKey, reload]);

  const uploadOne = async (entry: PendingUpload) => {
    setActiveId(entry.captureId);
    setProgress(0);
    setError('');
    try {
      await uploadRecord(entry.orderCode, entry.blob, entry.filename, entry.captureId, entry.recordedAt, setProgress);
      await removePendingUpload(entry.captureId);
      setItems((current) => current.filter((item) => item.captureId !== entry.captureId));
      onUploaded();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Tải lên thất bại.');
    } finally {
      setActiveId(null);
      setProgress(0);
    }
  };

  const discard = async (entry: PendingUpload) => {
    if (!window.confirm(`Bỏ video tạm của đơn ${entry.orderCode}? Thao tác này không thể hoàn tác.`)) return;
    await removePendingUpload(entry.captureId);
    setItems((current) => current.filter((item) => item.captureId !== entry.captureId));
  };

  const downloadLocal = (entry: PendingUpload) => {
    const url = URL.createObjectURL(entry.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = entry.filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  if (loading || items.length === 0) return null;

  return (
    <section className="pending-uploads" aria-live="polite">
      <div className="pending-uploads-head">
        <div>
          <strong>{items.length === 1 ? 'Còn 1 video chưa tải lên máy chủ' : `Còn ${items.length} video chưa tải lên máy chủ`}</strong>
          <span>Video được lưu tạm trên thiết bị. Bạn có thể tải lại trang và tiếp tục gửi.</span>
        </div>
      </div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      <ul className="pending-uploads-list">
        {items.map((entry) => {
          const uploading = activeId === entry.captureId;
          return (
            <li key={entry.captureId} className="pending-upload-row">
              <div className="pending-upload-meta">
                <span className="order-code">{entry.orderCode}</span>
                <span className="muted">{formatDate(entry.recordedAt)}</span>
                {uploading && progress > 0 && <span className="muted">Đang gửi · {progress}%</span>}
              </div>
              <div className="pending-upload-actions">
                <button type="button" className="button button-quiet" onClick={() => downloadLocal(entry)} disabled={Boolean(activeId)}>
                  Tải về máy
                </button>
                <button type="button" className="button button-quiet" onClick={() => void discard(entry)} disabled={Boolean(activeId)}>
                  Bỏ
                </button>
                <button type="button" className="button button-primary" onClick={() => void uploadOne(entry)} disabled={Boolean(activeId)}>
                  {uploading ? 'Đang gửi…' : 'Gửi lên máy chủ'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
