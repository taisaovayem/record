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
    <header className="site-header"><a className="brand" href="#" onClick={(event) => { event.preventDefault(); if (screen === 'list') setScreen('list'); }}><span className="brand-mark">▣</span><span>Sổ tay đóng gói</span></a><div className="header-status"><i /> Chỉ lưu trên máy của bạn</div></header>
    <main><div className="page-kicker"><span>QUẢN LÝ ĐƠN HÀNG</span><span className="kicker-line"/><span>PACKING RECORDS</span></div>
      {screen === 'list' ? <RecordList onNew={newRecord} onScan={scanFromList} refreshKey={refreshKey}/> : <Recorder initialOrderCode={prefill} onSaved={saved} onCancel={() => { setScreen('list'); setRefreshKey((value) => value + 1); }} autoScan={scanAfterOpen} />}
    </main>
    <footer className="site-footer"><span>VIDEO ĐÓNG GÓI</span><span>Ghi lại · Lưu trữ · Đối chiếu</span></footer>
  </div>;
}
