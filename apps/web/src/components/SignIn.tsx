import { useEffect, useState } from 'react';
import { loginWithPasskey } from '../api/auth';

interface Props {
  onSignedIn: (name: string) => void;
  onRetry: () => void;
  initialError?: string;
}

export default function SignIn({ onSignedIn, onRetry, initialError = '' }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);

  useEffect(() => setError(initialError), [initialError]);

  const signIn = async () => {
    setBusy(true);
    setError('');
    try {
      const session = await loginWithPasskey();
      onSignedIn(session.name);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không đăng nhập được bằng passkey.');
    } finally {
      setBusy(false);
    }
  };

  return <section className="auth-card">
    <div className="auth-mark" aria-hidden="true">P</div>
    <p className="eyebrow">PACKING VIDEO MANAGER</p>
    <h1>Đăng nhập</h1>
    <p className="auth-description">Dùng passkey đã lưu trong Google Password Manager để tiếp tục.</p>
    {error && <div className="notice notice-error" role="alert">{error}<button className="icon-button" onClick={() => setError('')}>×</button></div>}
    <button className="button button-primary auth-submit" onClick={() => void signIn()} disabled={busy}>
      {busy ? 'Đang xác thực…' : 'Đăng nhập bằng passkey'}
    </button>
    {initialError && <button className="auth-retry" onClick={onRetry}>Thử kết nối lại</button>}
  </section>;
}
