import { Fragment, useEffect, useState } from 'react';
import { getFindings } from '../api/client';
import type { FindingCategory, FindingsResponse } from '../types';

const POLL_INTERVAL_MS = 5000;

const CATEGORY_LABELS: Record<FindingCategory, string> = {
  IDLE_EC2: 'Idle EC2',
  UNATTACHED_EBS: 'Unattached EBS',
  UNDERUTILIZED_RDS: 'Underutilized RDS',
  LOW_ACTIVITY_S3: 'Low-Activity S3',
};

interface RecommendationsPageProps {
  onBack: () => void;
}

export default function RecommendationsPage({ onBack }: RecommendationsPageProps) {
  const [data, setData] = useState<FindingsResponse | null>(null);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    async function load() {
      const result = await getFindings();
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
        <h1>Recommendations</h1>
        <p>Your first infrastructure scan is running. Recommendations will appear here once it completes.</p>
      </div>
    );
  }

  if (data.status === 'READY' && data.findings !== null) {
    return (
      <div>
        <div>
          <h1>Recommendations</h1>
          <button onClick={onBack}>Back to Overview</button>
        </div>
        {data.findings.length === 0 ? (
          <p>No cost-optimization findings from the most recent scan.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Resource</th>
                <th>Category</th>
                <th>Severity</th>
                <th>Recommendation</th>
              </tr>
            </thead>
            <tbody>
              {data.findings.map((finding) => (
                <Fragment key={finding.id}>
                  <tr
                    onClick={() => setExpandedId(expandedId === finding.id ? null : finding.id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td>{`${finding.resourceType} ${finding.resourceId}`}</td>
                    <td>{CATEGORY_LABELS[finding.category]}</td>
                    <td className={`severity-${finding.severity.toLowerCase()}`}>{finding.severity}</td>
                    <td>{finding.recommendationText}</td>
                  </tr>
                  {expandedId === finding.id && (
                    <tr>
                      <td colSpan={4}>
                        <div>
                          <strong>AI Explanation</strong>
                          <p>
                            {finding.explanation !== null
                              ? finding.explanation
                              : 'AI explanation not yet available for this finding.'}
                          </p>
                        </div>
                        <div>
                          <strong>Suggested Action</strong>
                          <p>{finding.recommendationText}</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  // NOT_CONNECTED fallback — App routes away from this screen before a connection
  // is lost, but defend rather than render nothing.
  return (
    <div>
      <h1>Recommendations</h1>
      <p>No AWS account is connected yet.</p>
    </div>
  );
}
