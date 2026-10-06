import { useEffect, useState } from 'react';
import { registerPasskey } from '../api/auth';

export default function PasskeyEnrollment() {
  const [authorization, setAuthorization] = useState(() => window.location.hash.slice(1));
  const [name, setName] = useState('');
  const [status, setStatus] = useState<'ready' | 'working' | 'complete' | 'error'>('ready');
  const [error, setError] = useState('');

  useEffect(() => {
    window.history.replaceState(null, '', window.location.pathname);
    if (!authorization) {
      setStatus('error');
      setError('Thiếu mã đăng ký. Hãy tạo liên kết mới bằng lệnh trên server.');
    }
  }, []);

  const createPasskey = async () => {
    if (!authorization) return;
    setStatus('working');
    setError('');
    try {
      await registerPasskey(authorization, name.trim());
      setStatus('complete');
      setAuthorization('');
    } catch (reason) {
      setStatus('error');
      setError(reason instanceof Error ? reason.message : 'Không đăng ký được passkey.');
    }
  };

  return <section className="auth-card">
    <div className="auth-mark" aria-hidden="true">P</div>
    <p className="eyebrow">THIẾT LẬP XÁC THỰC</p>
    <h1>{status === 'complete' ? 'Đã tạo tài khoản' : 'Tạo tài khoản vận hành'}</h1>
    <p className="auth-description">{status === 'complete'
      ? 'Tài khoản và passkey đã được lưu. Bạn có thể đăng nhập bằng passkey này.'
      : 'Nhập tên của bạn rồi tạo passkey để thiết lập tài khoản vận hành.'}</p>
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {status === 'complete' ? <a className="button button-primary auth-submit" href="/">Đi tới đăng nhập</a> : <>
      <label className="auth-name">Tên người vận hành
        <input autoComplete="name" maxLength={255} value={name} onChange={(event) => setName(event.target.value)} disabled={status === 'working'} />
      </label>
      <button
      className="button button-primary auth-submit"
      onClick={() => void createPasskey()}
      disabled={!authorization || !name.trim() || status === 'working'}
    >{status === 'working' ? 'Đang tạo passkey…' : 'Tạo passkey'}</button>
    </>}
  </section>;
}
