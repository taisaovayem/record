import { useEffect, useRef, useState } from 'react';
import type { BrowserQRCodeReader } from '@zxing/browser';
import { uploadRecord } from '../api/records';

interface Props { initialOrderCode?: string; onSaved: () => void; onCancel: () => void; autoScan?: boolean }
type Phase = 'ready' | 'recording' | 'uploading' | 'failed';

const candidates = ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
function mimeChoice() { return typeof MediaRecorder === 'undefined' ? '' : candidates.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? ''; }
function fileExtension(mime: string) { return mime.toLowerCase().includes('mp4') ? 'mp4' : mime.toLowerCase().includes('ogg') ? 'ogv' : 'webm'; }

export default function Recorder({ initialOrderCode = '', onSaved, onCancel, autoScan = false }: Props) {
  const [orderCode, setOrderCode] = useState(initialOrderCode);
  const [phase, setPhase] = useState<Phase>('ready');
  const [error, setError] = useState('');
  const [cameraError, setCameraError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [mime, setMime] = useState('');
  const [blob, setBlob] = useState<Blob | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const mountedRef = useRef(true);
  const scannerRef = useRef<BrowserQRCodeReader | null>(null);
  const scannerAttemptRef = useRef<{ cancelled: boolean; decoded: boolean } | null>(null);
  const scannerControlsRef = useRef<{ attempt: { cancelled: boolean; decoded: boolean }; controls: { stop: () => void } } | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (scannerAttemptRef.current) scannerAttemptRef.current.cancelled = true;
      scannerControlsRef.current?.controls.stop();
      recorderRef.current?.state !== 'inactive' && recorderRef.current?.stop();
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (phase !== 'recording') return;
    if (videoRef.current && streamRef.current) { videoRef.current.srcObject = streamRef.current; void videoRef.current.play().catch(() => undefined); }
    const started = Date.now();
    const timer = window.setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 500);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => { if (autoScan) void scan(); }, [autoScan]);

  const releaseQrCamera = async () => {
    const { BrowserCodeReader } = await import('@zxing/browser');
    BrowserCodeReader.releaseAllStreams();
  };

  const closeScanner = () => {
    const attempt = scannerAttemptRef.current;
    if (attempt) attempt.cancelled = true;
    const current = scannerControlsRef.current;
    if (attempt && current?.attempt === attempt) { current.controls.stop(); scannerControlsRef.current = null; scannerAttemptRef.current = null; scannerRef.current = null; }
    if (mountedRef.current) setScanning(false);
  };
  const scan = async () => {
    const pending = scannerAttemptRef.current;
    if (pending) {
      if (pending.cancelled) return;
      closeScanner();
      return;
    }
    setError(''); setCameraError(''); setScanning(true);
    const attempt = { cancelled: false, decoded: false };
    scannerAttemptRef.current = attempt;
    let reader: BrowserQRCodeReader | null = null;
    try {
      if (!scannerRef.current) { const { BrowserQRCodeReader: Reader } = await import('@zxing/browser'); scannerRef.current = new Reader(); }
      if (attempt.cancelled) {
        if (scannerAttemptRef.current === attempt) scannerAttemptRef.current = null;
        return;
      }
      reader = scannerRef.current;
      const controls = await reader.decodeFromVideoDevice(undefined, 'qr-video', (result) => {
        if (!result || attempt.cancelled || attempt.decoded || !mountedRef.current) return;
        attempt.decoded = true;
        setOrderCode(result.getText());
        closeScanner();
        document.getElementById('order-code')?.focus();
      });
      if (attempt.cancelled || attempt.decoded) {
        controls.stop();
        try { await releaseQrCamera(); } catch { /* controls.stop() already releases this scanner's stream */ }
        if (scannerControlsRef.current?.attempt === attempt) scannerControlsRef.current = null;
        if (scannerRef.current === reader) scannerRef.current = null;
        if (scannerAttemptRef.current === attempt) scannerAttemptRef.current = null;
        return;
      }
      scannerControlsRef.current = { attempt, controls };
    } catch (reason) {
      if (scannerControlsRef.current?.attempt === attempt) { scannerControlsRef.current.controls.stop(); scannerControlsRef.current = null; }
      try { await releaseQrCamera(); } catch { /* preserve the original scanner error */ }
      if (scannerRef.current === reader) scannerRef.current = null;
      if (scannerAttemptRef.current === attempt) scannerAttemptRef.current = null;
      if (!attempt.cancelled && mountedRef.current) {
        setScanning(false);
        setCameraError(reason instanceof Error ? reason.message : 'Không mở được camera quét QR.');
      }
    }
  };

  const start = async () => {
    if (!orderCode.trim()) { setError('Nhập mã đơn trước khi quay.'); document.getElementById('order-code')?.focus(); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setCameraError('Trình duyệt này chưa hỗ trợ quay video. Hãy mở ứng dụng bằng localhost hoặc HTTPS trên trình duyệt hiện đại.'); return; }
    closeScanner(); setError(''); setCameraError('');
    if (scannerAttemptRef.current) { setCameraError('Đang đóng máy quét QR. Vui lòng đợi một chút rồi thử quay lại.'); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      const chosen = mimeChoice(); setMime(chosen || 'video/webm');
      const recorder = chosen ? new MediaRecorder(stream, { mimeType: chosen }) : new MediaRecorder(stream);
      recorderRef.current = recorder; chunksRef.current = [];
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        const type = recorder.mimeType || chunksRef.current[0]?.type || chosen || 'video/webm';
        const capture = new Blob(chunksRef.current, { type });
        chunksRef.current = [];
        stream.getTracks().forEach((track) => track.stop()); streamRef.current = null;
        if (videoRef.current) videoRef.current.srcObject = null;
        if (!capture.size) { setPhase('ready'); setCameraError('Không thu được dữ liệu video. Vui lòng kiểm tra camera và thử lại.'); return; }
        setBlob(capture); setMime(type); setPhase('uploading'); void send(capture, type);
      };
      recorder.start(1000); setElapsed(0); setPhase('recording');
    } catch (reason) {
      streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
      setCameraError(reason instanceof Error ? reason.message : 'Không thể truy cập camera hoặc microphone. Kiểm tra quyền trình duyệt.');
    }
  };

  const stop = () => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  };

  const send = async (capture: Blob, type = capture.type) => {
    setPhase('uploading'); setError(''); setProgress(0);
    try {
      const extension = fileExtension(type);
      await uploadRecord(orderCode.trim(), capture, `packing-${Date.now()}.${extension}`, setProgress);
      setBlob(null); onSaved();
    } catch (reason) {
      setBlob(capture); setPhase('failed');
      setError(reason instanceof Error ? reason.message : 'Lưu video thất bại. Bản quay vẫn được giữ để thử lại.');
    }
  };

  const duration = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  return <section className="recorder-panel">
    <div className="recorder-top"><button className="back-button" onClick={onCancel} disabled={phase === 'recording' || phase === 'uploading' || Boolean(blob)}>← Danh sách</button><span className="eyebrow">BẢN QUAY MỚI</span></div>
    <div className="recorder-intro"><div><p className="eyebrow">GHI LẠI QUÁ TRÌNH ĐÓNG GÓI</p><h2>Mã đơn hàng</h2><p className="muted">Quét mã hoặc nhập mã đơn cần lưu video.</p></div><span className="recorder-step">01 <i>/</i> 01</span></div>
    <div className="order-entry"><label htmlFor="order-code">Mã đơn</label><div className="entry-row"><input id="order-code" value={orderCode} onChange={(event) => setOrderCode(event.target.value)} placeholder="Ví dụ: DH-2026-001" maxLength={255} disabled={phase === 'recording' || phase === 'uploading' || Boolean(blob)} autoFocus /><button className="button button-quiet" onClick={scan} disabled={phase === 'recording' || phase === 'uploading' || Boolean(blob)}>{scanning ? 'Đóng máy quét' : <>▦ Quét QR <kbd>Alt Q</kbd></>}</button></div>
      {scanning && <div className="scanner-box"><video id="qr-video" autoPlay muted playsInline /><span>Đưa mã QR vào khung hình</span><button className="button button-quiet" onClick={closeScanner}>Đóng</button></div>}
      {cameraError && <div className="notice notice-error">{cameraError}</div>}
    </div>
    {phase === 'recording' && <div className="camera-preview"><video ref={videoRef} autoPlay muted playsInline /><span className="recording-badge"><i /> ĐANG QUAY</span><span className="timer">{duration}</span></div>}
    {phase === 'ready' && <div className="recording-placeholder"><div className="camera-symbol">◉</div><strong>Sẵn sàng ghi hình</strong><span>Đặt hàng trong khung hình rồi bắt đầu quay.</span></div>}
    {phase === 'uploading' && <div className="upload-state"><div className="spinner"/><div><strong>Đang lưu video{progress > 0 ? ` · ${progress}%` : '…'}</strong><span>Giữ trang này mở trong khi tải lên.</span></div></div>}
    {phase === 'failed' && <div className="retry-card"><div><strong>Video chưa được lưu</strong><span>Bản quay còn trong bộ nhớ trình duyệt. Thử lại để lưu đúng video này.</span></div><button className="button button-primary" onClick={() => blob && void send(blob, mime)}>Thử tải lại</button></div>}
    {error && <div className="notice notice-error" role="alert">{error}</div>}
    <div className="recorder-footer"><div className="format-note"><span className="secure-dot"/> Định dạng: {mime || mimeChoice() || 'Tự động chọn'}</div><div className="record-actions">{phase === 'recording' ? <><span className="live-duration"><i /> {duration}</span><button className="button button-stop" onClick={stop}>■ Dừng & lưu <kbd>Alt S</kbd></button></> : phase === 'ready' ? <button className="button button-record" onClick={() => void start()}>● Bắt đầu quay <kbd>Alt R</kbd></button> : null}</div></div>
    <span className="shortcut-hints">Tạo mới <kbd>Alt N</kbd> <span>·</span> Quét QR <kbd>Alt Q</kbd> <span>·</span> Quay <kbd>Alt R</kbd> <span>·</span> Dừng <kbd>Alt S</kbd></span>
  </section>;
}
