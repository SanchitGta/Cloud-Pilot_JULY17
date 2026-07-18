process.env.CONNECTION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.DB_PATH = ':memory:';

import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../src/db/index.js';
import { overviewRouter } from '../src/routes/overview.js';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', overviewRouter);
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

// Insert a scan with an explicit status and completed_at so tests can control
// ordering deterministically (no reliance on strftime('now') resolution).
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

function insertEc2(scanId: number, instanceId: string): void {
  getDb()
    .prepare(
      `INSERT INTO scan_ec2_instances (scan_id, instance_id, instance_type, state, avg_cpu_14d)
       VALUES (?, ?, 't3.micro', 'running', 5)`
    )
    .run(scanId, instanceId);
}

function insertEbs(scanId: number, volumeId: string): void {
  getDb()
    .prepare(
      `INSERT INTO scan_ebs_volumes (scan_id, volume_id, size_gb, attachment_status)
       VALUES (?, ?, 100, 'unattached')`
    )
    .run(scanId, volumeId);
}

function insertRds(scanId: number, dbInstanceId: string): void {
  getDb()
    .prepare(
      `INSERT INTO scan_rds_instances (scan_id, db_instance_id, instance_type, avg_cpu_14d)
       VALUES (?, ?, 'db.t3.micro', 3)`
    )
    .run(scanId, dbInstanceId);
}

function insertS3(scanId: number, bucketName: string): void {
  getDb()
    .prepare(
      `INSERT INTO scan_s3_buckets (scan_id, bucket_name, size_bytes, object_count, size_30d_ago_bytes)
       VALUES (?, ?, 1000, 5, 1000)`
    )
    .run(scanId, bucketName);
}

function insertFinding(scanId: number, resourceId: string, savings: number): void {
  getDb()
    .prepare(
      `INSERT INTO findings (scan_id, resource_type, resource_id, category, severity, estimated_monthly_savings, recommendation_text)
       VALUES (?, 'EC2', ?, 'IDLE_EC2', 'MEDIUM', ?, 'Stop it')`
    )
    .run(scanId, resourceId, savings);
}

describe('overview API', () => {
  const app = buildApp();

  beforeEach(() => {
    const db = getDb();
    db.exec(
      `DELETE FROM findings; DELETE FROM scan_ec2_instances; DELETE FROM scan_ebs_volumes;
       DELETE FROM scan_rds_instances; DELETE FROM scan_s3_buckets;
       DELETE FROM scans; DELETE FROM connections;`
    );
  });

  it('returns NOT_CONNECTED when there is no connection', async () => {
    const res = await request(app).get('/api/overview');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'NOT_CONNECTED', overview: null });
  });

  it('returns AWAITING_FIRST_SCAN when the only scan is still RUNNING', async () => {
    const connectionId = insertConnection();
    insertScan(connectionId, 'RUNNING', null);

    const res = await request(app).get('/api/overview');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'AWAITING_FIRST_SCAN', overview: null });
  });

  it('returns AWAITING_FIRST_SCAN when the only scan FAILED (has a scan row, no completed scan)', async () => {
    const connectionId = insertConnection();
    insertScan(connectionId, 'FAILED', '2026-07-18T10:00:00.000Z');

    const res = await request(app).get('/api/overview');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'AWAITING_FIRST_SCAN', overview: null });
  });

  it('returns READY with metrics summed across all four resource tables and findings', async () => {
    const connectionId = insertConnection();
    const scanId = insertScan(connectionId, 'SUCCEEDED', '2026-07-18T10:00:00.000Z');

    insertEc2(scanId, 'i-1');
    insertEc2(scanId, 'i-2');
    insertEbs(scanId, 'vol-1');
    insertRds(scanId, 'db-1');
    insertS3(scanId, 'bucket-a');
    // 2 + 1 + 1 + 1 = 5 resources total

    insertFinding(scanId, 'i-1', 10.5);
    insertFinding(scanId, 'i-2', 4.25);
    // 2 findings, 14.75 total savings

    const res = await request(app).get('/api/overview');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('READY');
    expect(res.body.overview).toMatchObject({
      totalResourcesScanned: 5,
      totalMonthlySavings: 14.75,
      totalFindings: 2,
      scanId,
      scanCompletedAt: '2026-07-18T10:00:00.000Z',
    });
  });

  it('reflects the newest SUCCEEDED scan, not an older one, when two have completed', async () => {
    const connectionId = insertConnection();

    // Older succeeded scan: 1 resource, 1 finding worth 100.
    const olderScanId = insertScan(connectionId, 'SUCCEEDED', '2026-07-18T09:00:00.000Z');
    insertEc2(olderScanId, 'i-old');
    insertFinding(olderScanId, 'i-old', 100);

    // Newer succeeded scan: 3 resources, 1 finding worth 7.
    const newerScanId = insertScan(connectionId, 'SUCCEEDED', '2026-07-18T11:00:00.000Z');
    insertEc2(newerScanId, 'i-new');
    insertEbs(newerScanId, 'vol-new');
    insertS3(newerScanId, 'bucket-new');
    insertFinding(newerScanId, 'i-new', 7);

    const res = await request(app).get('/api/overview');

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('READY');
    expect(res.body.overview).toMatchObject({
      scanId: newerScanId,
      totalResourcesScanned: 3,
      totalMonthlySavings: 7,
      totalFindings: 1,
      scanCompletedAt: '2026-07-18T11:00:00.000Z',
    });
  });
});
