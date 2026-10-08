import { useEffect, useState, type FormEvent } from 'react';
import { getRetentionSettings, saveRetentionSettings, type RetentionSettings } from '../api/settings';

interface Props {
  onSaved: () => void;
  onCancel: () => void;
}

const defaults: RetentionSettings = {
  autoDeleteRecordsEnabled: false,
  autoDeleteRecordsAfterDays: 60,
  purgeVideosEnabled: false,
  purgeVideosAfterDays: 60,
};

export default function Settings({ onSaved, onCancel }: Props) {
  const [settings, setSettings] = useState(defaults);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getRetentionSettings().then((value) => {
      if (active) {
        setSettings(value);
        setLoaded(true);
      }
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Không tải được cài đặt.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [loadAttempt]);

  const update = <K extends keyof RetentionSettings>(key: K, value: RetentionSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await saveRetentionSettings(settings);
      onSaved();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không lưu được cài đặt.');
    } finally {
      setSaving(false);
    }
  };

  return <section className="settings-panel">
    <header className="settings-heading">
      <div>
        <p className="eyebrow">TÙY CHỈNH HỆ THỐNG</p>
        <h2>Cài đặt lưu trữ</h2>
        <p className="muted">Quản lý thời gian lưu bản ghi và video gốc.</p>
      </div>
      <button className="button button-quiet" type="button" onClick={onCancel}>← Trang chủ</button>
    </header>

    {error && <div className="notice notice-error" role="alert">{error}</div>}

    {loading ? <p className="settings-loading">Đang tải cài đặt…</p> : !loaded ? <button className="button button-quiet" type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Thử tải lại</button> : <form onSubmit={(event) => void save(event)}>
      <div className="retention-setting">
        <div className="retention-setting-heading">
          <div>
            <label className="retention-title" htmlFor="auto-delete-records">Tự động xóa bản ghi</label>
            <span className="retention-tooltip" tabIndex={0} role="img" aria-label="Xóa bản ghi sau khi tạo xx ngày" title="Xóa bản ghi sau khi tạo xx ngày">?</span>
          </div>
          <label className="retention-switch" aria-label="Bật tự động xóa bản ghi">
            <input id="auto-delete-records" type="checkbox" role="switch" checked={settings.autoDeleteRecordsEnabled} onChange={(event) => update('autoDeleteRecordsEnabled', event.target.checked)} />
            <span className="retention-switch-track" aria-hidden="true" />
          </label>
        </div>
        <label className="retention-days">Xóa sau
          <input type="number" min={1} max={36_500} step={1} value={settings.autoDeleteRecordsAfterDays} disabled={!settings.autoDeleteRecordsEnabled} onChange={(event) => update('autoDeleteRecordsAfterDays', Number(event.target.value))} />
          ngày kể từ khi tạo
        </label>
      </div>

      <div className="retention-setting">
        <div className="retention-setting-heading">
          <div>
            <label className="retention-title" htmlFor="purge-original-videos">Xóa vĩnh viễn video gốc</label>
            <span className="retention-tooltip" tabIndex={0} role="img" aria-label="Xóa vĩnh viễn video gốc sau khi bản ghi bị xóa xx ngày" title="Xóa vĩnh viễn video gốc sau khi bản ghi bị xóa xx ngày">?</span>
          </div>
          <label className="retention-switch" aria-label="Bật xóa vĩnh viễn video gốc">
            <input id="purge-original-videos" type="checkbox" role="switch" checked={settings.purgeVideosEnabled} onChange={(event) => update('purgeVideosEnabled', event.target.checked)} />
            <span className="retention-switch-track" aria-hidden="true" />
          </label>
        </div>
        <label className="retention-days">Xóa video sau
          <input type="number" min={1} max={36_500} step={1} value={settings.purgeVideosAfterDays} disabled={!settings.purgeVideosEnabled} onChange={(event) => update('purgeVideosAfterDays', Number(event.target.value))} />
          ngày kể từ khi bản ghi bị xóa
        </label>
      </div>

      <div className="settings-actions">
        <button className="button button-primary" type="submit" disabled={saving}>{saving ? 'Đang lưu…' : 'Lưu cài đặt'}</button>
      </div>
    </form>}
  </section>;
}
