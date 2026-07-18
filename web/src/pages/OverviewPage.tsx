import { useEffect, useState } from 'react';
import { getOverview } from '../api/client';
import type { OverviewResponse } from '../types';

const POLL_INTERVAL_MS = 5000;

interface OverviewPageProps {
  onViewRecommendations: () => void;
}

export default function OverviewPage({ onViewRecommendations }: OverviewPageProps) {
  const [data, setData] = useState<OverviewResponse | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    async function load() {
      const result = await getOverview();
      if (cancelled) {
        return;
      }
      setData(result);
      // Stop polling once the first scan has completed — nothing left to wait for.
      if (result.status === 'READY' && intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    }

    load();
    // Poll while the initial background scan may still be running. load() clears
    // the interval as soon as it observes READY.
    intervalId = setInterval(load, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      if (intervalId !== undefined) {
        clearInterval(intervalId);
      }
    };
  }, []);

  if (data === null) {
    return <p>Loading...</p>;
  }

  if (data.status === 'AWAITING_FIRST_SCAN') {
    return (
      <div>
        <h1>Overview</h1>
        <p>Your first infrastructure scan is running. Metrics will appear here once it completes.</p>
      </div>
    );
  }

  if (data.status === 'READY' && data.overview) {
    const { totalResourcesScanned, totalMonthlySavings, totalFindings } = data.overview;
    return (
      <div>
        <h1>Overview</h1>
        <dl>
          <dt>Total resources scanned</dt>
          <dd>{totalResourcesScanned}</dd>
          <dt>Estimated monthly savings</dt>
          <dd>${totalMonthlySavings.toFixed(2)}</dd>
          <dt>Total findings</dt>
          <dd>{totalFindings}</dd>
        </dl>
        <button onClick={onViewRecommendations}>View Recommendations</button>
      </div>
    );
  }

  // NOT_CONNECTED should not normally reach here (App routes to ConnectPage when
  // there's no connection), but render a safe fallback rather than nothing.
  return (
    <div>
      <h1>Overview</h1>
      <p>No AWS account is connected yet.</p>
    </div>
  );
}
