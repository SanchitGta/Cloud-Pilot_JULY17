import { useEffect, useState } from 'react';
import { createConnection, getCurrentConnection, getRegions } from '../api/client';
import type { Connection, Scan } from '../types';

type PageState = 'loading' | 'form' | 'confirmed';

export default function ConnectPage() {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [regions, setRegions] = useState<string[]>([]);
  const [connection, setConnection] = useState<Connection | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);

  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [region, setRegion] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const [existingConnection, availableRegions] = await Promise.all([
        getCurrentConnection(),
        getRegions(),
      ]);

      setRegions(availableRegions);
      if (existingConnection) {
        setConnection(existingConnection);
        setPageState('confirmed');
      } else {
        setRegion(availableRegions[0] ?? '');
        setPageState('form');
      }
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setErrorMessage('');

    const result = await createConnection({ accessKeyId, secretAccessKey, region });

    if ('error' in result) {
      setErrorMessage(result.error.message);
      setSecretAccessKey('');
      setSubmitting(false);
      return;
    }

    setConnection(result.connection);
    setScan(result.scan);
    setPageState('confirmed');
    setSubmitting(false);
  }

  if (pageState === 'loading') {
    return <p>Loading...</p>;
  }

  if (pageState === 'confirmed' && connection) {
    return (
      <div>
        <h1>AWS account connected</h1>
        <p>Account: {connection.awsAccountId}</p>
        <p>Region: {connection.region}</p>
        <p>Connected: {connection.createdAt}</p>
        {scan && <p>Initial infrastructure scan started (scan #{scan.id}).</p>}
      </div>
    );
  }

  return (
    <div>
      <h1>Connect your AWS account</h1>
      {errorMessage && <div role="alert">{errorMessage}</div>}
      <form onSubmit={handleSubmit}>
        <label>
          Access Key ID
          <input
            type="text"
            value={accessKeyId}
            onChange={(e) => setAccessKeyId(e.target.value)}
            required
          />
        </label>
        <label>
          Secret Access Key
          <input
            type="password"
            value={secretAccessKey}
            onChange={(e) => setSecretAccessKey(e.target.value)}
            required
          />
        </label>
        <label>
          Region
          <select value={region} onChange={(e) => setRegion(e.target.value)} required>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" disabled={submitting}>
          Connect
        </button>
      </form>
    </div>
  );
}
