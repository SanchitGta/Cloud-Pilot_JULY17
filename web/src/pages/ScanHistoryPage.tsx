import { useEffect, useRef, useState } from 'react';
import { getScanHistory, startRescan } from '../api/client';
import type { ScanHistoryResponse } from '../types';

const POLL_INTERVAL_MS = 5000;

interface ScanHistoryPageProps {
  onBack: () => void;
}

export default function ScanHistoryPage({ onBack }: ScanHistoryPageProps) {
  const [data, setData] = useState<ScanHistoryResponse | null>(null);
  const [rescanning, setRescanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;

    async function load() {
      const result = await getScanHistory();
      if (cancelledRef.current) {
        return;
      }
      setData(result);
      const anyActive = result.scans.some(
        (s) => s.status === 'PENDING' || s.status === 'RUNNING'
      );
      if (!anyActive && intervalRef.current !== undefined) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
    }

    load();
    intervalRef.current = setInterval(load, POLL_INTERVAL_MS);

    return () => {
      cancelledRef.current = true;
      if (intervalRef.current !== undefined) {
        clearInterval(intervalRef.current);
        intervalRef.current = undefined;
      }
    };
  }, []);

  async function handleRescan() {
    setRescanning(true);
    setErrorMessage('');
    try {
      const result = await startRescan();
      if ('error' in result) {
        setErrorMessage(result.error.message);
        return;
      }
      // Immediately load so the new RUNNING row appears without waiting for the next poll tick.
      const fresh = await getScanHistory();
      if (cancelledRef.current) return;
      setData(fresh);
      // Re-arm polling if it had stopped (no active scans before).
      if (intervalRef.current === undefined) {
        intervalRef.current = setInterval(async () => {
          const r = await getScanHistory();
          if (cancelledRef.current) return;
          setData(r);
          const anyActive = r.scans.some(
            (s) => s.status === 'PENDING' || s.status === 'RUNNING'
          );
          if (!anyActive && intervalRef.current !== undefined) {
            clearInterval(intervalRef.current);
            intervalRef.current = undefined;
          }
        }, POLL_INTERVAL_MS);
      }
    } finally {
      setRescanning(false);
    }
  }

  if (data === null) {
    return <p>Loading...</p>;
  }

  const anyActive = data.scans.some(
    (s) => s.status === 'PENDING' || s.status === 'RUNNING'
  );

  return (
    <div>
      <h1>Scan History</h1>
      <button onClick={onBack}>Back to Overview</button>
      {' '}
      <button onClick={handleRescan} disabled={rescanning || anyActive}>
        Rescan
      </button>
      {errorMessage && <div role="alert">{errorMessage}</div>}
      <table>
        <thead>
          <tr>
            <th>Started</th>
            <th>Trigger</th>
            <th>Status</th>
            <th>Findings</th>
            <th>Est. Monthly Savings</th>
          </tr>
        </thead>
        <tbody>
          {data.scans.map((scan) => (
            <tr key={scan.id}>
              <td>{new Date(scan.createdAt).toLocaleString()}</td>
              <td>{scan.trigger}</td>
              <td>{scan.status}</td>
              {scan.status === 'SUCCEEDED' ? (
                <>
                  <td>{scan.findingsCount}</td>
                  <td>${scan.estimatedMonthlySavings!.toFixed(2)}</td>
                </>
              ) : scan.status === 'FAILED' ? (
                <>
                  <td colSpan={2}>Failed{scan.errorMessage ? `: ${scan.errorMessage}` : ''}</td>
                </>
              ) : (
                <>
                  <td colSpan={2}>Running…</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
