process.env.CONNECTION_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64');
process.env.DB_PATH = ':memory:';

import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../src/db/index.js';
import { scansRouter } from '../src/routes/scans.js';

vi.mock('../src/services/awsValidation.js', () => ({
  validateCredentials: vi.fn(),
}));

vi.mock('../src/services/scanOrchestrator.js', () => ({
  runScan: vi.fn().mockResolvedValue(undefined),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', scansRouter);
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
  trigger: string = 'AUTOMATIC'
): number {
  const db = getDb();
  const scan = db
    .prepare(
      `INSERT INTO scans (connection_id, status, trigger) VALUES (?, ?, ?) RETURNING *`
    )
    .get(connectionId, status, trigger) as { id: number };
  return scan.id;
}

function insertFinding(scanId: number, savings: number): void {
  getDb()
    .prepare(
      `INSERT INTO findings (scan_id, resource_type, resource_id, category, severity, estimated_monthly_savings, recommendation_text)
       VALUES (?, 'EC2', 'i-1', 'IDLE_EC2', 'MEDIUM', ?, 'Stop it')`
    )
    .run(scanId, savings);
}

describe('scans API', () => {
  const app = buildApp();

  beforeEach(() => {
    const db = getDb();
    db.exec('DELETE FROM findings; DELETE FROM scans; DELETE FROM connections;');
  });

  describe('GET /api/scans', () => {
    it('returns { scans: [] } when no connection exists', async () => {
      const res = await request(app).get('/api/scans');

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ scans: [] });
    });

    it('returns scans ordered newest-first with correct field shapes', async () => {
      const connId = insertConnection();
      const scan1Id = insertScan(connId, 'SUCCEEDED', 'AUTOMATIC');
      insertFinding(scan1Id, 15.0);
      const scan2Id = insertScan(connId, 'RUNNING', 'MANUAL');

      const res = await request(app).get('/api/scans');

      expect(res.status).toBe(200);
      expect(res.body.scans).toHaveLength(2);

      // Newest first
      const [newest, oldest] = res.body.scans;
      expect(newest.id).toBe(scan2Id);
      expect(newest.status).toBe('RUNNING');
      expect(newest.trigger).toBe('MANUAL');
      expect(newest.findingsCount).toBeNull();
      expect(newest.estimatedMonthlySavings).toBeNull();
      expect(newest).toHaveProperty('createdAt');
      expect(newest).toHaveProperty('completedAt');
      expect(newest).toHaveProperty('errorMessage');

      expect(oldest.id).toBe(scan1Id);
      expect(oldest.status).toBe('SUCCEEDED');
      expect(oldest.trigger).toBe('AUTOMATIC');
      expect(oldest.findingsCount).toBe(1);
      expect(oldest.estimatedMonthlySavings).toBe(15.0);
    });
  });

  describe('POST /api/scans', () => {
    it('returns 409 NO_CONNECTION when no connection exists', async () => {
      const res = await request(app).post('/api/scans');

      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error: {
          code: 'NO_CONNECTION',
          message: 'Connect an AWS account before running a scan.',
        },
      });
    });

    it('returns 409 SCAN_IN_PROGRESS when a scan is already PENDING or RUNNING', async () => {
      const connId = insertConnection();
      insertScan(connId, 'RUNNING', 'AUTOMATIC');

      const res = await request(app).post('/api/scans');

      expect(res.status).toBe(409);
      expect(res.body).toEqual({
        error: {
          code: 'SCAN_IN_PROGRESS',
          message: 'A scan is already running.',
        },
      });
    });

    it('returns 201 with a MANUAL RUNNING scan and calls runScan', async () => {
      insertConnection();

      const res = await request(app).post('/api/scans');

      expect(res.status).toBe(201);
      expect(res.body.scan).toMatchObject({
        status: 'RUNNING',
        trigger: 'MANUAL',
      });
      expect(res.body.scan).toHaveProperty('id');
      expect(res.body.scan).toHaveProperty('createdAt');
    });
  });
});
