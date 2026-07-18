import { useEffect, useState } from 'react';
import { createConnection, getRegions } from '../api/client';

type PageState = 'loading' | 'form';

interface ConnectPageProps {
  // Called after a successful connect so App can route to the Overview screen.
  onConnected: () => void;
}

export default function ConnectPage({ onConnected }: ConnectPageProps) {
  const [pageState, setPageState] = useState<PageState>('loading');
  const [regions, setRegions] = useState<string[]>([]);

  const [accessKeyId, setAccessKeyId] = useState('');
  const [secretAccessKey, setSecretAccessKey] = useState('');
  const [region, setRegion] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      const availableRegions = await getRegions();
      setRegions(availableRegions);
      setRegion(availableRegions[0] ?? '');
      setPageState('form');
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

    setSubmitting(false);
    onConnected();
  }

  if (pageState === 'loading') {
    return <p>Loading...</p>;
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
