import { useEffect, useState } from 'react';
import { registerPasskey } from '../api/auth';

export default function PasskeyEnrollment() {
  const [authorization, setAuthorization] = useState(() => window.location.hash.slice(1));
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
      await registerPasskey(authorization);
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
    <h1>{status === 'complete' ? 'Đã thêm passkey' : 'Thêm passkey'}</h1>
    <p className="auth-description">{status === 'complete'
      ? 'Passkey đã được lưu. Bạn có thể đăng nhập bằng passkey này.'
      : 'Trình duyệt sẽ mở Google Password Manager để tạo passkey cho tên miền này.'}</p>
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    {status === 'complete' ? <a className="button button-primary auth-submit" href="/">Đi tới đăng nhập</a> : <button
      className="button button-primary auth-submit"
      onClick={() => void createPasskey()}
      disabled={!authorization || status === 'working'}
    >{status === 'working' ? 'Đang tạo passkey…' : 'Tạo passkey'}</button>}
  </section>;
}
