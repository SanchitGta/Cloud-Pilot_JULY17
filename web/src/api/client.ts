import type { ApiError, Connection, OverviewResponse, Scan } from '../types';

export async function getCurrentConnection(): Promise<Connection | null> {
  const res = await fetch('/api/connections/current');
  const body = await res.json();
  return body.connection;
}

export async function getOverview(): Promise<OverviewResponse> {
  const res = await fetch('/api/overview');
  return res.json();
}

export async function getRegions(): Promise<string[]> {
  const res = await fetch('/api/regions');
  return res.json();
}

export async function createConnection(input: {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}): Promise<{ connection: Connection; scan: Scan } | { error: ApiError }> {
  const res = await fetch('/api/connections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  const body = await res.json();
  if (!res.ok) {
    return { error: body.error };
  }
  return body;
}
