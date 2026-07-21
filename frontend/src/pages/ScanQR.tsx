import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

export default function ScanQR() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

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
      // If not JSON, try as a raw storage code
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
        <p className="text-gray-500 dark:text-gray-400 mt-1">Enter QR code data or scan with webcam</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <form onSubmit={handleSubmit}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900 dark:text-white">Manual Entry</h2>
              <Link to="/scan" className="text-sm text-primary-600 dark:text-primary-400 hover:text-primary-700 font-medium">
                Use Webcam →
              </Link>
            </div>
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
        </div>

        <div className="card">
          <h2 className="font-semibold text-gray-900 dark:text-white mb-4">Quick Lookup</h2>
          <p className="text-xs text-gray-400 dark:text-gray-500">
            This page accepts QR code data in JSON format with <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">type</code> and{' '}
            <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">id</code> fields.
            For storage locations, you can also enter just the location code (e.g., CAB-A1-T3).
          </p>
          <div className="mt-4">
            <Link to="/scan" className="btn-primary block text-center">
              📷 Open Webcam Scanner
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
