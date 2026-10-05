import { useCallback, useState } from 'react';
import RecordList from './components/RecordList';
import Recorder from './components/Recorder';
import { useShortcuts } from './hooks/useShortcuts';

export default function App() {
  const [screen, setScreen] = useState<'list' | 'recorder'>('list');
  const [refreshKey, setRefreshKey] = useState(0);
  const [prefill, setPrefill] = useState('');
  const [scanAfterOpen, setScanAfterOpen] = useState(false);
  const newRecord = useCallback(() => { setPrefill(''); setScanAfterOpen(false); setScreen('recorder'); }, []);
  const scanFromList = useCallback(() => { setPrefill(''); setScanAfterOpen(true); setScreen('recorder'); }, []);
  const saved = useCallback(() => { setScreen('list'); setRefreshKey((value) => value + 1); }, []);
  useShortcuts({ n: () => { if (screen === 'list') newRecord(); }, q: () => screen === 'list' ? scanFromList() : document.querySelector<HTMLButtonElement>('.order-entry .button-quiet')?.click(), r: () => document.querySelector<HTMLButtonElement>('.button-record')?.click(), s: () => document.querySelector<HTMLButtonElement>('.button-stop')?.click() });

  return <div className="app-shell">
    <main>
      {screen === 'list' ? <RecordList onNew={newRecord} onScan={scanFromList} refreshKey={refreshKey}/> : <Recorder initialOrderCode={prefill} onSaved={saved} onCancel={() => { setScreen('list'); setRefreshKey((value) => value + 1); }} autoScan={scanAfterOpen} />}
    </main>
  </div>;
}
