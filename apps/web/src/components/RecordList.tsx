import { useEffect, useState } from 'react';
import { deleteRecords, downloadUrl, listRecords, type PackingRecord, type RecordPage } from '../api/records';

interface Props {
  onNew: () => void;
  refreshKey: number;
  onScan: () => void;
}

const emptyPage: RecordPage = { items: [], total: 0, page: 1, limit: 20, totalPages: 0 };
const formatDate = (value: string) => new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));

export default function RecordList({ onNew, refreshKey, onScan }: Props) {
  const [result, setResult] = useState(emptyPage);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    listRecords(page, 20, search).then((data) => {
      if (active) { setResult(data); setSelection(new Set()); }
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Không tải được danh sách.');
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [page, search, refreshKey]);

  useEffect(() => {
    if (page > 1 && page > result.totalPages) setPage(Math.max(1, result.totalPages));
  }, [page, result.totalPages]);

  const allSelected = result.items.length > 0 && result.items.every((record) => selection.has(record.id));
  const togglePage = () => setSelection((current) => {
    const next = new Set(current);
    if (allSelected) result.items.forEach((record) => next.delete(record.id));
    else result.items.forEach((record) => next.add(record.id));
    return next;
  });
  const toggle = (record: PackingRecord) => setSelection((current) => {
    const next = new Set(current); next.has(record.id) ? next.delete(record.id) : next.add(record.id); return next;
  });
  const remove = async () => {
    const ids = [...selection];
    if (!ids.length || !window.confirm(`Xóa ${ids.length} video đã chọn? Thao tác này không thể hoàn tác.`)) return;
    setDeleting(true); setError('');
    try {
      const outcome = await deleteRecords(ids);
      if (outcome.failures.length) setError(`Đã xóa ${outcome.deletedIds.length}; ${outcome.failures.length} mục chưa xóa được. Làm mới danh sách để thử lại.`);
      const nextPage = page > 1 && result.items.length === outcome.deletedIds.length ? page - 1 : page;
      setPage(nextPage);
      const refreshed = await listRecords(nextPage, 20, search);
      setResult(refreshed); setSelection(new Set());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không xóa được các video.');
    } finally { setDeleting(false); }
  };

  return <section className="list-panel">
    <div className="list-heading">
      <div>
        <div className="toolbar">
          <label className="search-box"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} placeholder="Tìm theo mã đơn" aria-label="Tìm theo mã đơn" />{search && <button aria-label="Xóa tìm kiếm" className="icon-button" onClick={() => setSearch('')}>×</button>}</label>
          <button className="button button-quiet" onClick={onScan}><span aria-hidden="true">▦</span> Quét QR <kbd>Q</kbd></button>
          {selection.size > 0 && <button className="button button-danger" onClick={remove} disabled={deleting}>{deleting ? 'Đang xóa…' : `Xóa ${selection.size} mục`}</button>}
        </div>
      </div>
      <button className="button button-primary" onClick={onNew}>＋ <span>Tạo bản quay</span> <kbd>N</kbd></button>
    </div>
    
    {error && <div className="notice notice-error" role="alert">{error}<button className="icon-button" onClick={() => setError('')}>×</button></div>}
    <div className="table-wrap">
      <table><thead><tr><th className="check-cell"><input type="checkbox" aria-label="Chọn tất cả trên trang" checked={allSelected} onChange={togglePage} disabled /></th><th>MÃ ĐƠN</th><th>THỜI GIAN QUAY</th><th className="action-heading">VIDEO</th></tr></thead>
        <tbody>{loading ? <tr><td colSpan={4} className="table-state">Đang tải danh sách…</td></tr> : result.items.length === 0 ? <tr><td colSpan={4} className="table-state"><div className="empty-icon">▤</div><strong>{search ? 'Không tìm thấy đơn hàng' : 'Chưa có video nào'}</strong><span>{search ? 'Thử một mã đơn khác.' : 'Bắt đầu bằng cách tạo bản quay đầu tiên.'}</span></td></tr> : result.items.map((record) => <tr key={record.id}>
          <td className="check-cell"><input type="checkbox" aria-label={`Chọn đơn ${record.orderCode}`} checked={selection.has(record.id)} onChange={() => toggle(record)} /></td>
          <td><span className="order-code">{record.orderCode}</span></td><td className="date-cell">{formatDate(record.recordedAt)}</td>
          <td className="action-cell"><a className="download-link" href={downloadUrl(record.id)} download title={`Tải video đơn ${record.orderCode}`}><span aria-hidden="true">↓</span> Tải video</a></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="pagination"><span>{result.total ? `Trang ${page} / ${Math.max(1, result.totalPages)}` : 'Không có kết quả'}</span><div><button className="button button-page" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading}>← Trước</button><button className="button button-page" onClick={() => setPage((current) => current + 1)} disabled={loading || page >= result.totalPages}>Tiếp →</button></div></div>
  </section>;
}
