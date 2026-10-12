import { useEffect, useRef, useState } from 'react';

interface Props { onDecoded: (value: string) => void; onClose: () => void }

export default function ListQrScanner({ onDecoded, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    let controls: { stop: () => void } | null = null;

    void (async () => {
      try {
        const { BrowserQRCodeReader: Reader } = await import('@zxing/browser');
        if (cancelled || !videoRef.current) return;
        const reader = new Reader();
        controls = await reader.decodeFromVideoDevice(undefined, videoRef.current, (result) => {
          if (!result || cancelled) return;
          cancelled = true;
          controls?.stop();
          onDecoded(result.getText());
        });
        if (cancelled) controls.stop();
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : 'Không mở được camera quét QR.');
      }
    })();

    return () => {
      cancelled = true;
      controls?.stop();
    };
  }, [onDecoded]);

  return <div className="list-scanner" role="dialog" aria-label="Quét mã QR">
    <video ref={videoRef} autoPlay muted playsInline />
    <span>Đưa mã QR vào khung hình</span>
    {error && <p role="alert">{error}</p>}
    <button type="button" className="button button-quiet" onClick={onClose}>Hủy quét</button>
  </div>;
}
