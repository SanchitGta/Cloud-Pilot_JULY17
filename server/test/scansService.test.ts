process.env.CONNECTION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.DB_PATH = ':memory:';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../src/db/index.js';
import * as scanOrchestrator from '../src/services/scanOrchestrator.js';
import { getScanHistory, startRescan } from '../src/services/scansService.js';

vi.mock('../src/services/scanOrchestrator.js', () => ({
  runScan: vi.fn().mockResolvedValue(undefined),
}));

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

describe('scansService.getScanHistory', () => {
  beforeEach(() => {
    const db = getDb();
    db.exec('DELETE FROM findings; DELETE FROM scans; DELETE FROM connections;');
  });

  it('returns empty array when no connection exists', () => {
    expect(getScanHistory()).toEqual([]);
  });

  it('returns AUTOMATIC and MANUAL SUCCEEDED scans with correct findings data, newest first', () => {
    const connId = insertConnection();
    const scan1Id = insertScan(connId, 'SUCCEEDED', 'AUTOMATIC');
    insertFinding(scan1Id, 10.5);
    insertFinding(scan1Id, 4.25);
    const scan2Id = insertScan(connId, 'SUCCEEDED', 'MANUAL');
    insertFinding(scan2Id, 20.0);

    const history = getScanHistory();

    expect(history).toHaveLength(2);
    // Newest first (scan2 has higher id)
    expect(history[0].id).toBe(scan2Id);
    expect(history[0].trigger).toBe('MANUAL');
    expect(history[0].status).toBe('SUCCEEDED');
    expect(history[0].findingsCount).toBe(1);
    expect(history[0].estimatedMonthlySavings).toBe(20.0);

    expect(history[1].id).toBe(scan1Id);
    expect(history[1].trigger).toBe('AUTOMATIC');
    expect(history[1].findingsCount).toBe(2);
    expect(history[1].estimatedMonthlySavings).toBe(14.75);
  });

  it('returns null findingsCount and estimatedMonthlySavings for RUNNING scan', () => {
    const connId = insertConnection();
    insertScan(connId, 'RUNNING', 'AUTOMATIC');

    const history = getScanHistory();

    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('RUNNING');
    expect(history[0].findingsCount).toBeNull();
    expect(history[0].estimatedMonthlySavings).toBeNull();
  });

  it('returns null findingsCount and estimatedMonthlySavings for FAILED scan', () => {
    const connId = insertConnection();
    insertScan(connId, 'FAILED', 'AUTOMATIC');

    const history = getScanHistory();

    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('FAILED');
    expect(history[0].findingsCount).toBeNull();
    expect(history[0].estimatedMonthlySavings).toBeNull();
  });

  it('returns findingsCount 0 and estimatedMonthlySavings 0 for SUCCEEDED scan with zero findings', () => {
    // A SUCCEEDED scan absent from the batched Map is not the same as "not SUCCEEDED".
    const connId = insertConnection();
    insertScan(connId, 'SUCCEEDED', 'AUTOMATIC');

    const history = getScanHistory();

    expect(history).toHaveLength(1);
    expect(history[0].status).toBe('SUCCEEDED');
    expect(history[0].findingsCount).toBe(0);
    expect(history[0].estimatedMonthlySavings).toBe(0);
  });
});

describe('scansService.startRescan', () => {
  beforeEach(() => {
    const db = getDb();
    db.exec('DELETE FROM scans; DELETE FROM connections;');
    vi.mocked(scanOrchestrator.runScan).mockReset();
    vi.mocked(scanOrchestrator.runScan).mockResolvedValue(undefined);
  });

  it('returns no_connection when no connection exists', () => {
    const result = startRescan();
    expect(result).toEqual({
      kind: 'no_connection',
      message: 'Connect an AWS account before running a scan.',
    });
  });

  it('returns scan_in_progress when a PENDING scan already exists', () => {
    const connId = insertConnection();
    insertScan(connId, 'PENDING', 'AUTOMATIC');

    const result = startRescan();

    expect(result).toEqual({
      kind: 'scan_in_progress',
      message: 'A scan is already running.',
    });
  });

  it('returns scan_in_progress when a RUNNING scan already exists', () => {
    const connId = insertConnection();
    insertScan(connId, 'RUNNING', 'AUTOMATIC');

    const result = startRescan();

    expect(result).toEqual({
      kind: 'scan_in_progress',
      message: 'A scan is already running.',
    });
  });

  it('inserts a MANUAL RUNNING scan and calls runScan on success', () => {
    const connId = insertConnection();

    const result = startRescan();

    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.scan.status).toBe('RUNNING');
      expect(result.scan.trigger).toBe('MANUAL');
      expect(result.scan.started_at).not.toBeNull();
      expect(scanOrchestrator.runScan).toHaveBeenCalledWith(result.scan.id);
    }
    // Verify it's in the DB
    const db = getDb();
    const row = db.prepare('SELECT * FROM scans WHERE connection_id = ?').get(connId) as {
      status: string;
      trigger: string;
    };
    expect(row.status).toBe('RUNNING');
    expect(row.trigger).toBe('MANUAL');
  });

  it('allows rescan once a prior scan is SUCCEEDED (no active scan)', () => {
    const connId = insertConnection();
    insertScan(connId, 'SUCCEEDED', 'AUTOMATIC');

    const result = startRescan();

    expect(result.kind).toBe('success');
    if (result.kind === 'success') {
      expect(result.scan.trigger).toBe('MANUAL');
    }
  });
});
