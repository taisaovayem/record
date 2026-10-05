import { useCallback, useState } from 'react';
import RecordList from './components/RecordList';
import Recorder from './components/Recorder';
import { useShortcuts } from './hooks/useShortcuts';

export default function App() {
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
  useShortcuts({
    n: () => { if (screen === 'list') newRecord(); },
    q: () => screen === 'list' ? scanFromList() : document.querySelector<HTMLButtonElement>('.order-entry .button-quiet')?.click(),
    r: () => document.querySelector<HTMLButtonElement>('.button-record')?.click(),
    s: () => document.querySelector<HTMLButtonElement>('.button-stop')?.click(),
    i: () => { if (screen === 'recorder') document.querySelector<HTMLInputElement>('.continuous-toggle')?.click(); },
    w: () => { if (screen === 'recorder') document.querySelector<HTMLButtonElement>('.back-button')?.click(); },
  });

  return <div className="app-shell">
    <main>
      {screen === 'list' ? <RecordList onNew={newRecord} onScan={scanFromList} refreshKey={refreshKey}/> : <Recorder initialOrderCode={prefill} onSaved={saved} onCancel={exitRecorder} autoScan={scanAfterOpen} continuous={continuous} onContinuousChange={changeContinuous} />}
    </main>
  </div>;
}
