process.env.CONNECTION_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64');
process.env.DB_PATH = ':memory:';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../src/db/index.js';
import * as connectionsRepo from '../src/repos/connectionsRepo.js';
import * as scansRepo from '../src/repos/scansRepo.js';
import * as ec2Collector from '../src/collectors/ec2Collector.js';
import * as ebsCollector from '../src/collectors/ebsCollector.js';
import * as rdsCollector from '../src/collectors/rdsCollector.js';
import * as s3Collector from '../src/collectors/s3Collector.js';
import * as recommendationEngine from '../src/services/recommendationEngine.js';
import { runScan } from '../src/services/scanOrchestrator.js';

vi.mock('../src/repos/connectionsRepo.js', () => ({
  getDecryptedCredentials: vi.fn(),
}));
vi.mock('../src/collectors/ec2Collector.js', () => ({ collect: vi.fn() }));
vi.mock('../src/collectors/ebsCollector.js', () => ({ collect: vi.fn() }));
vi.mock('../src/collectors/rdsCollector.js', () => ({ collect: vi.fn() }));
vi.mock('../src/collectors/s3Collector.js', () => ({ collect: vi.fn() }));

const creds = { accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'shh', region: 'us-east-1' };

function countRows(table: string, scanId: number): number {
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(*) as count FROM ${table} WHERE scan_id = ?`).get(scanId) as {
    count: number;
  };
  return row.count;
}

function insertTestScan(): number {
  const db = getDb();
  const conn = db
    .prepare(
      `INSERT INTO connections (access_key_id, encrypted_secret_key, region, aws_account_id, aws_arn)
       VALUES ('AKIAEXAMPLE', 'enc', 'us-east-1', '123456789012', 'arn:aws:iam::123456789012:user/test')
       RETURNING *`
    )
    .get() as { id: number };
  const scan = db
    .prepare(`INSERT INTO scans (connection_id, status) VALUES (?, 'RUNNING') RETURNING *`)
    .get(conn.id) as { id: number };
  return scan.id;
}

describe('scanOrchestrator.runScan', () => {
  beforeEach(() => {
    const db = getDb();
    db.exec(
      `DELETE FROM findings; DELETE FROM scan_ec2_instances; DELETE FROM scan_ebs_volumes;
       DELETE FROM scan_rds_instances; DELETE FROM scan_s3_buckets;
       DELETE FROM scans; DELETE FROM connections;`
    );
    vi.mocked(connectionsRepo.getDecryptedCredentials).mockReset();
    vi.mocked(ec2Collector.collect).mockReset();
    vi.mocked(ebsCollector.collect).mockReset();
    vi.mocked(rdsCollector.collect).mockReset();
    vi.mocked(s3Collector.collect).mockReset();
  });

  it('marks the scan SUCCEEDED and persists all four resource types when every collector succeeds', async () => {
    vi.mocked(connectionsRepo.getDecryptedCredentials).mockReturnValue(creds);
    vi.mocked(ec2Collector.collect).mockResolvedValue([
      { instanceId: 'i-1', instanceType: 't3.micro', state: 'running', avgCpu14d: 12.5 },
    ]);
    vi.mocked(ebsCollector.collect).mockResolvedValue([
      { volumeId: 'vol-1', sizeGb: 100, attachmentStatus: 'attached' },
    ]);
    vi.mocked(rdsCollector.collect).mockResolvedValue([
      { dbInstanceId: 'db-1', instanceType: 'db.t3.micro', avgCpu14d: null },
    ]);
    vi.mocked(s3Collector.collect).mockResolvedValue([
      { bucketName: 'bucket-a', sizeBytes: 1000, objectCount: 5, size30dAgoBytes: 900 },
    ]);

    const scanId = insertTestScan();
    await runScan(scanId);

    const scan = scansRepo.getScan(scanId)!;
    expect(scan.status).toBe('SUCCEEDED');
    expect(scan.completed_at).not.toBeNull();
    expect(countRows('scan_ec2_instances', scanId)).toBe(1);
    expect(countRows('scan_ebs_volumes', scanId)).toBe(1);
    expect(countRows('scan_rds_instances', scanId)).toBe(1);
    expect(countRows('scan_s3_buckets', scanId)).toBe(1);
  });

  it('marks the scan FAILED with an EC2-labelled error and inserts no rows when the EC2 collector throws', async () => {
    vi.mocked(connectionsRepo.getDecryptedCredentials).mockReturnValue(creds);
    vi.mocked(ec2Collector.collect).mockRejectedValue(new Error('no ec2 access'));
    vi.mocked(ebsCollector.collect).mockResolvedValue([]);
    vi.mocked(rdsCollector.collect).mockResolvedValue([]);
    vi.mocked(s3Collector.collect).mockResolvedValue([]);

    const scanId = insertTestScan();
    await runScan(scanId);

    const scan = scansRepo.getScan(scanId)!;
    expect(scan.status).toBe('FAILED');
    expect(scan.error_message).toContain('EC2 collector failed:');
    expect(countRows('scan_ec2_instances', scanId)).toBe(0);
    expect(countRows('scan_ebs_volumes', scanId)).toBe(0);
    expect(countRows('scan_rds_instances', scanId)).toBe(0);
    expect(countRows('scan_s3_buckets', scanId)).toBe(0);
  });

  it('marks the scan FAILED with an EBS-labelled error when the EBS collector throws', async () => {
    vi.mocked(connectionsRepo.getDecryptedCredentials).mockReturnValue(creds);
    vi.mocked(ec2Collector.collect).mockResolvedValue([]);
    vi.mocked(ebsCollector.collect).mockRejectedValue(new Error('no ebs access'));
    vi.mocked(rdsCollector.collect).mockResolvedValue([]);
    vi.mocked(s3Collector.collect).mockResolvedValue([]);

    const scanId = insertTestScan();
    await runScan(scanId);

    const scan = scansRepo.getScan(scanId)!;
    expect(scan.status).toBe('FAILED');
    expect(scan.error_message).toContain('EBS collector failed:');
  });

  it('marks the scan FAILED with an RDS-labelled error when the RDS collector throws', async () => {
    vi.mocked(connectionsRepo.getDecryptedCredentials).mockReturnValue(creds);
    vi.mocked(ec2Collector.collect).mockResolvedValue([]);
    vi.mocked(ebsCollector.collect).mockResolvedValue([]);
    vi.mocked(rdsCollector.collect).mockRejectedValue(new Error('no rds access'));
    vi.mocked(s3Collector.collect).mockResolvedValue([]);

    const scanId = insertTestScan();
    await runScan(scanId);

    const scan = scansRepo.getScan(scanId)!;
    expect(scan.status).toBe('FAILED');
    expect(scan.error_message).toContain('RDS collector failed:');
  });

  it('marks the scan FAILED with an S3-labelled error when the S3 collector throws', async () => {
    vi.mocked(connectionsRepo.getDecryptedCredentials).mockReturnValue(creds);
    vi.mocked(ec2Collector.collect).mockResolvedValue([]);
    vi.mocked(ebsCollector.collect).mockResolvedValue([]);
    vi.mocked(rdsCollector.collect).mockResolvedValue([]);
    vi.mocked(s3Collector.collect).mockRejectedValue(new Error('no s3 access'));

    const scanId = insertTestScan();
    await runScan(scanId);

    const scan = scansRepo.getScan(scanId)!;
    expect(scan.status).toBe('FAILED');
    expect(scan.error_message).toContain('S3 collector failed:');
  });

  it('marks the scan FAILED when the DB transaction fails after all collectors succeed', async () => {
    vi.mocked(connectionsRepo.getDecryptedCredentials).mockReturnValue(creds);
    vi.mocked(ec2Collector.collect).mockResolvedValue([]);
    vi.mocked(ebsCollector.collect).mockResolvedValue([
      // invalid attachment_status violates the CHECK constraint, forcing the transaction to fail
      { volumeId: 'vol-1', sizeGb: 100, attachmentStatus: 'bogus' as unknown as 'attached' },
    ]);
    vi.mocked(rdsCollector.collect).mockResolvedValue([]);
    vi.mocked(s3Collector.collect).mockResolvedValue([]);

    const scanId = insertTestScan();
    await runScan(scanId);

    const scan = scansRepo.getScan(scanId)!;
    expect(scan.status).toBe('FAILED');
    expect(countRows('scan_ebs_volumes', scanId)).toBe(0);
  });

  it('marks the scan FAILED with "No AWS connection found." when there is no connection', async () => {
    vi.mocked(connectionsRepo.getDecryptedCredentials).mockReturnValue(null);

    const scanId = insertTestScan();
    await runScan(scanId);

    const scan = scansRepo.getScan(scanId)!;
    expect(scan.status).toBe('FAILED');
    expect(scan.error_message).toBe('No AWS connection found.');
    expect(ec2Collector.collect).not.toHaveBeenCalled();
  });

  it('generates findings for a resource that triggers a detection rule after the scan succeeds', async () => {
    vi.mocked(connectionsRepo.getDecryptedCredentials).mockReturnValue(creds);
    vi.mocked(ec2Collector.collect).mockResolvedValue([
      { instanceId: 'i-1', instanceType: 't3.micro', state: 'running', avgCpu14d: 1 },
    ]);
    vi.mocked(ebsCollector.collect).mockResolvedValue([]);
    vi.mocked(rdsCollector.collect).mockResolvedValue([]);
    vi.mocked(s3Collector.collect).mockResolvedValue([]);

    const scanId = insertTestScan();
    await runScan(scanId);

    const scan = scansRepo.getScan(scanId)!;
    expect(scan.status).toBe('SUCCEEDED');
    expect(countRows('findings', scanId)).toBe(1);
  });

  it('keeps the scan SUCCEEDED with zero findings when the recommendation engine throws', async () => {
    vi.mocked(connectionsRepo.getDecryptedCredentials).mockReturnValue(creds);
    vi.mocked(ec2Collector.collect).mockResolvedValue([]);
    vi.mocked(ebsCollector.collect).mockResolvedValue([]);
    vi.mocked(rdsCollector.collect).mockResolvedValue([]);
    vi.mocked(s3Collector.collect).mockResolvedValue([]);
    const spy = vi.spyOn(recommendationEngine, 'generateFindings').mockImplementation(() => {
      throw new Error('boom');
    });

    const scanId = insertTestScan();
    await runScan(scanId);

    const scan = scansRepo.getScan(scanId)!;
    expect(scan.status).toBe('SUCCEEDED');
    expect(countRows('findings', scanId)).toBe(0);

    spy.mockRestore();
  });
});
