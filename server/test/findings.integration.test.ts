process.env.CONNECTION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.DB_PATH = ':memory:';

import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../src/db/index.js';
import { findingsRouter } from '../src/routes/findings.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', findingsRouter);
  return app;
}

function insertConnection(): number {
  const db = getDb();
  const conn = db
    .prepare(
      `INSERT INTO connections (access_key_id, encrypted_secret_key, region, aws_account_id, aws_arn)
       VALUES ('AKIAEXAMPLE', 'enc', 'us-east-1', '123456789012', 'arn:aws:iam::123456789012:user/test')
       RETURNING *`
    )
    .get() as { id: number };
  return conn.id;
}

function insertScan(
  connectionId: number,
  status: string,
  completedAt: string | null
): number {
  const db = getDb();
  const scan = db
    .prepare(
      `INSERT INTO scans (connection_id, status, completed_at) VALUES (?, ?, ?) RETURNING *`
    )
    .get(connectionId, status, completedAt) as { id: number };
  return scan.id;
}

interface FindingOptions {
  resourceType?: string;
  resourceId?: string;
  category?: string;
  severity?: string;
  savings?: number;
  recommendationText?: string;
  explanation?: string | null;
}

function insertFinding(scanId: number, opts: FindingOptions = {}): number {
  const {
    resourceType = 'EC2',
    resourceId = 'i-default',
    category = 'IDLE_EC2',
    severity = 'MEDIUM',
    savings = 10,
    recommendationText = 'Stop it',
    explanation = null,
  } = opts;
  const db = getDb();
  const row = db
    .prepare(
      `INSERT INTO findings (scan_id, resource_type, resource_id, category, severity, estimated_monthly_savings, recommendation_text, explanation)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
    )
    .get(scanId, resourceType, resourceId, category, severity, savings, recommendationText, explanation) as { id: number };
  return row.id;
}

describe('findings API', () => {
  const app = buildApp();

  beforeEach(() => {
    const db = getDb();
    db.exec(`DELETE FROM findings; DELETE FROM scans; DELETE FROM connections;`);
  });

  it('returns NOT_CONNECTED when there is no connection', async () => {
    const res = await request(app).get('/api/findings');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'NOT_CONNECTED', findings: null });
  });

  it('returns AWAITING_FIRST_SCAN when the only scan is still RUNNING', async () => {
    const connectionId = insertConnection();
    insertScan(connectionId, 'RUNNING', null);

    const res = await request(app).get('/api/findings');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'AWAITING_FIRST_SCAN', findings: null });
  });

  it('returns AWAITING_FIRST_SCAN when the only scan FAILED', async () => {
    const connectionId = insertConnection();
    insertScan(connectionId, 'FAILED', '2026-07-18T10:00:00.000Z');

    const res = await request(app).get('/api/findings');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'AWAITING_FIRST_SCAN', findings: null });
  });

  it('returns READY with findings mapped to camelCase including null explanation', async () => {
    const connectionId = insertConnection();
    const scanId = insertScan(connectionId, 'SUCCEEDED', '2026-07-18T10:00:00.000Z');
    insertFinding(scanId, {
      resourceType: 'EC2',
      resourceId: 'i-abc123',
      category: 'IDLE_EC2',
      severity: 'HIGH',
      savings: 50,
      recommendationText: 'Stop the idle instance',
      explanation: null,
    });
    insertFinding(scanId, {
      resourceType: 'EBS',
      resourceId: 'vol-xyz',
      category: 'UNATTACHED_EBS',
      severity: 'LOW',
      savings: 5,
      recommendationText: 'Delete unattached volume',
      explanation: 'This volume has been unattached for 30 days and is costing $5/month.',
    });

    const res = await request(app).get('/api/findings');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('READY');
    expect(res.body.scanId).toBe(scanId);
    expect(res.body.scanCompletedAt).toBe('2026-07-18T10:00:00.000Z');
    expect(res.body.findings).toHaveLength(2);

    // Higher savings comes first (ORDER BY estimated_monthly_savings DESC).
    const first = res.body.findings[0];
    expect(first.resourceType).toBe('EC2');
    expect(first.resourceId).toBe('i-abc123');
    expect(first.category).toBe('IDLE_EC2');
    expect(first.severity).toBe('HIGH');
    expect(first.estimatedMonthlySavings).toBe(50);
    expect(first.recommendationText).toBe('Stop the idle instance');
    expect(first.explanation).toBeNull();

    const second = res.body.findings[1];
    expect(second.resourceType).toBe('EBS');
    expect(second.resourceId).toBe('vol-xyz');
    expect(second.explanation).toBe('This volume has been unattached for 30 days and is costing $5/month.');
  });

  it('reflects the newest SUCCEEDED scan findings, not an older scan', async () => {
    const connectionId = insertConnection();

    const olderScanId = insertScan(connectionId, 'SUCCEEDED', '2026-07-18T09:00:00.000Z');
    insertFinding(olderScanId, { resourceId: 'i-old', savings: 100 });

    const newerScanId = insertScan(connectionId, 'SUCCEEDED', '2026-07-18T11:00:00.000Z');
    insertFinding(newerScanId, { resourceId: 'i-new', savings: 7 });

    const res = await request(app).get('/api/findings');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('READY');
    expect(res.body.scanId).toBe(newerScanId);
    expect(res.body.findings).toHaveLength(1);
    expect(res.body.findings[0].resourceId).toBe('i-new');
  });

  it('returns READY with empty findings array when a succeeded scan has no findings', async () => {
    const connectionId = insertConnection();
    const scanId = insertScan(connectionId, 'SUCCEEDED', '2026-07-18T10:00:00.000Z');

    const res = await request(app).get('/api/findings');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('READY');
    expect(res.body.scanId).toBe(scanId);
    // Empty array — not null; null is reserved for non-READY states.
    expect(res.body.findings).toEqual([]);
  });

  it('returns findings ordered by estimated_monthly_savings DESC', async () => {
    const connectionId = insertConnection();
    const scanId = insertScan(connectionId, 'SUCCEEDED', '2026-07-18T10:00:00.000Z');
    insertFinding(scanId, { resourceId: 'i-low', savings: 5 });
    insertFinding(scanId, { resourceId: 'i-high', savings: 200 });
    insertFinding(scanId, { resourceId: 'i-mid', savings: 50 });

    const res = await request(app).get('/api/findings');

    expect(res.status).toBe(200);
    const ids = res.body.findings.map((f: { resourceId: string }) => f.resourceId);
    expect(ids).toEqual(['i-high', 'i-mid', 'i-low']);
  });
});
