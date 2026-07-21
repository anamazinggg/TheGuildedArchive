import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { productConfig } from '../config/product';

export default function Scan() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    document.title = `Scan QR — ${productConfig.productName}`;
  }, []);

  const startScanning = async () => {
    setCameraError('');
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      setCameraError('Could not access camera. Please ensure camera permissions are granted.');
      setScanning(false);
    }
  };

  const stopScanning = () => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setScanning(false);
  };

  const captureFrame = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.readyState !== video.HAVE_ENOUGH_DATA) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return imageData;
  };

  const processQRCode = (data: string) => {
    try {
      const trimmed = data.trim();
      if (!trimmed) return;

      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        if (/^[A-Za-z0-9-]+$/.test(trimmed)) {
          navigate(`/storage?code=${encodeURIComponent(trimmed)}`);
          stopScanning();
          return;
        }
        return;
      }

      if (parsed.type === 'inventory' && parsed.id) {
        navigate(`/inventory/${parsed.id}`);
        stopScanning();
      } else if (parsed.type === 'storage' && parsed.id) {
        navigate(`/storage/${parsed.id}`);
        stopScanning();
      }
    } catch {
      // ignore parse errors
    }
  };

  useEffect(() => {
    if (!scanning) return;

    // Use BarcodeDetector API if available
    if ('BarcodeDetector' in window) {
      const detector = new (window as any).BarcodeDetector({ formats: ['qr_code'] });
      scanIntervalRef.current = setInterval(async () => {
        const video = videoRef.current;
        if (!video || video.readyState < video.HAVE_ENOUGH_DATA) return;
        try {
          const barcodes = await detector.detect(video);
          if (barcodes.length > 0) {
            processQRCode(barcodes[0].rawValue);
          }
        } catch {
          // detection error, continue
        }
      }, 500);
    } else {
      // Fallback: capture frames periodically (we still show the manual entry for non-BarcodeDetector browsers)
      setCameraError('QR scanning uses manual entry on this browser. Paste QR data below or use a browser with BarcodeDetector API (Chrome 83+).');
    }

    return () => {
      if (scanIntervalRef.current) {
        clearInterval(scanIntervalRef.current);
      }
    };
  }, [scanning]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmed = code.trim();
    if (!trimmed) return;

    try {
      const data = JSON.parse(trimmed);
      if (data.type === 'inventory' && data.id) {
        navigate(`/inventory/${data.id}`);
        return;
      }
      if (data.type === 'storage' && data.id) {
        navigate(`/storage/${data.id}`);
        return;
      }
      setError('Unrecognized QR code format. Expected JSON with type and id.');
    } catch {
      if (/^[A-Za-z0-9-]+$/.test(trimmed)) {
        navigate(`/storage?code=${encodeURIComponent(trimmed)}`);
        return;
      }
      setError('Invalid QR code data. Please scan a valid Gilded Archive QR code.');
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif font-bold text-2xl text-gray-900 dark:text-white">Scan QR Code</h1>
        <p className="text-gray-500 dark:text-gray-400 mt-1">Scan a QR code with your webcam or paste data manually</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Camera scanner */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">📷 Webcam Scanner</h2>

          {!scanning ? (
            <div className="text-center py-8">
              <button onClick={startScanning} className="btn-primary">
                Start Camera
              </button>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-3">
                Point a Gilded Archive QR code at the camera to navigate
              </p>
            </div>
          ) : (
            <div>
              <div className="relative bg-black rounded-lg overflow-hidden mb-3">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  className="w-full max-h-64 object-cover"
                  onLoadedMetadata={() => videoRef.current?.play()}
                />
                <canvas ref={canvasRef} className="hidden" />
              </div>
              <button onClick={stopScanning} className="btn-secondary w-full">
                Stop Camera
              </button>
            </div>
          )}

          {cameraError && (
            <div className="mt-3 p-3 bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-700 rounded-lg">
              <p className="text-sm text-yellow-700 dark:text-yellow-300">{cameraError}</p>
            </div>
          )}
        </div>

        {/* Manual entry */}
        <div className="card">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">⌨️ Manual Entry</h2>
          <form onSubmit={handleSubmit}>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Paste the data from a scanned QR code, or type a storage location code.
            </p>
            {error && (
              <div className="bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg text-sm mb-4">{error}</div>
            )}
            <textarea
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="input-field font-mono text-sm"
              rows={4}
              placeholder='{"type":"storage","id":"abc-123","code":"CAB-A1-T3"}'
            />
            <button type="submit" className="btn-primary mt-4 w-full">
              Navigate
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Quick Lookup</h3>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              This page accepts QR code data in JSON format with <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">type</code> and{' '}
              <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">id</code> fields.
              For storage locations, you can also enter just the location code (e.g., CAB-A1-T3).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
