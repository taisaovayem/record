import { useCallback, useEffect, useState } from 'react';
import RecordList from './components/RecordList';
import Recorder from './components/Recorder';
import SignIn from './components/SignIn';
import PasskeyEnrollment from './components/PasskeyEnrollment';
import { getSession, logout } from './api/auth';
import { useShortcuts } from './hooks/useShortcuts';

export default function App() {
  const enrollmentPage = window.location.pathname === '/enroll';
  const [authState, setAuthState] = useState<'loading' | 'authenticated' | 'unauthenticated'>('loading');
  const [operatorName, setOperatorName] = useState('');
  const [authError, setAuthError] = useState('');
  const [sessionRefresh, setSessionRefresh] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [screen, setScreen] = useState<'list' | 'recorder'>('list');
  const [refreshKey, setRefreshKey] = useState(0);
  const [prefill, setPrefill] = useState('');
  const [scanAfterOpen, setScanAfterOpen] = useState(false);
  const [continuous, setContinuous] = useState(() => {
    try { return window.localStorage.getItem('packing-continuous-mode') !== 'false'; }
    catch { return true; }
  });
  const newRecord = useCallback(() => { setPrefill(''); setScanAfterOpen(false); setScreen('recorder'); }, []);
  const scanFromList = useCallback(() => { setPrefill(''); setScanAfterOpen(true); setScreen('recorder'); }, []);
  const saved = useCallback(() => { setRefreshKey((value) => value + 1); }, []);
  const exitRecorder = useCallback(() => setScreen('list'), []);
  const changeContinuous = useCallback((enabled: boolean) => {
    setContinuous(enabled);
    try { window.localStorage.setItem('packing-continuous-mode', String(enabled)); } catch { /* storage may be unavailable */ }
  }, []);

  useEffect(() => {
    if (enrollmentPage) return;
    let active = true;
    setAuthState('loading');
    setAuthError('');
    getSession().then((session) => {
      if (active) {
        setAuthState(session.authenticated ? 'authenticated' : 'unauthenticated');
        setOperatorName(session.authenticated ? session.name ?? '' : '');
      }
    }).catch((reason: unknown) => {
      if (active) {
        setAuthState('unauthenticated');
        setAuthError(reason instanceof Error ? reason.message : 'Không kết nối được máy chủ.');
      }
    });
    return () => { active = false; };
  }, [enrollmentPage, sessionRefresh]);

  useEffect(() => {
    const onExpired = () => {
      setAuthState('unauthenticated');
      setOperatorName('');
    };
    window.addEventListener('packing-auth-expired', onExpired);
    return () => window.removeEventListener('packing-auth-expired', onExpired);
  }, []);

  const retrySession = () => { setAuthError(''); setSessionRefresh((value) => value + 1); };
  const signOut = async () => {
    setLoggingOut(true);
    setLogoutError('');
    try {
      await logout();
      setAuthState('unauthenticated');
      setOperatorName('');
      setScreen('list');
    } catch (reason) {
      setLogoutError(reason instanceof Error ? reason.message : 'Không đăng xuất được.');
    } finally {
      setLoggingOut(false);
    }
  };
  useShortcuts({
    n: () => { if (screen === 'list') newRecord(); },
    q: () => screen === 'list' ? scanFromList() : document.querySelector<HTMLButtonElement>('.order-entry .button-quiet')?.click(),
    r: () => document.querySelector<HTMLButtonElement>('.button-record')?.click(),
    s: () => document.querySelector<HTMLButtonElement>('.button-stop')?.click(),
    i: () => { if (screen === 'recorder') document.querySelector<HTMLInputElement>('.continuous-toggle')?.click(); },
    w: () => { if (screen === 'recorder') document.querySelector<HTMLButtonElement>('.back-button')?.click(); },
  });

  if (enrollmentPage) return <div className="auth-shell"><PasskeyEnrollment /></div>;
  if (authState === 'loading') return <div className="auth-shell"><section className="auth-card"><div className="auth-mark" aria-hidden="true">P</div><p className="auth-description">Đang kiểm tra đăng nhập…</p></section></div>;
  if (authState === 'unauthenticated') return <div className="auth-shell"><SignIn initialError={authError} onRetry={retrySession} onSignedIn={(name) => { setAuthError(''); setOperatorName(name); setAuthState('authenticated'); }} /></div>;

  return <div className="app-shell">
    <main>
      {screen === 'list' ? <RecordList onNew={newRecord} onScan={scanFromList} refreshKey={refreshKey}/> : <Recorder initialOrderCode={prefill} onSaved={saved} onCancel={exitRecorder} autoScan={scanAfterOpen} continuous={continuous} onContinuousChange={changeContinuous} />}
    </main>
    <footer className="auth-toolbar"><span>{operatorName}</span><button className="button button-quiet" onClick={() => void signOut()} disabled={loggingOut}>{loggingOut ? 'Đang đăng xuất…' : 'Đăng xuất'}</button></footer>
    {logoutError && <div className="notice notice-error" role="alert">{logoutError}<button className="icon-button" onClick={() => setLogoutError('')}>×</button></div>}
  </div>;
}
