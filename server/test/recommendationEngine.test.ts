process.env.CONNECTION_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64');
process.env.DB_PATH = ':memory:';

import { beforeEach, describe, expect, it } from 'vitest';
import { getDb } from '../src/db/index.js';
import * as findingsRepo from '../src/repos/findingsRepo.js';
import { generateFindings } from '../src/services/recommendationEngine.js';

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

function insertEc2(scanId: number, opts: { instanceId: string; instanceType: string; state: string; avgCpu14d: number | null }): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO scan_ec2_instances (scan_id, instance_id, instance_type, state, avg_cpu_14d)
     VALUES (?,?,?,?,?)`
  ).run(scanId, opts.instanceId, opts.instanceType, opts.state, opts.avgCpu14d);
}

function insertEbs(scanId: number, opts: { volumeId: string; sizeGb: number; attachmentStatus: string }): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO scan_ebs_volumes (scan_id, volume_id, size_gb, attachment_status)
     VALUES (?,?,?,?)`
  ).run(scanId, opts.volumeId, opts.sizeGb, opts.attachmentStatus);
}

function insertRds(scanId: number, opts: { dbInstanceId: string; instanceType: string; avgCpu14d: number | null }): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO scan_rds_instances (scan_id, db_instance_id, instance_type, avg_cpu_14d)
     VALUES (?,?,?,?)`
  ).run(scanId, opts.dbInstanceId, opts.instanceType, opts.avgCpu14d);
}

function insertS3(
  scanId: number,
  opts: { bucketName: string; sizeBytes: number; objectCount: number; size30dAgoBytes: number | null }
): void {
  const db = getDb();
  db.prepare(
    `INSERT INTO scan_s3_buckets (scan_id, bucket_name, size_bytes, object_count, size_30d_ago_bytes)
     VALUES (?,?,?,?,?)`
  ).run(scanId, opts.bucketName, opts.sizeBytes, opts.objectCount, opts.size30dAgoBytes);
}

const GB = 1024 ** 3;

describe('recommendationEngine.generateFindings', () => {
  beforeEach(() => {
    const db = getDb();
    db.exec(
      `DELETE FROM findings; DELETE FROM scan_ec2_instances; DELETE FROM scan_ebs_volumes;
       DELETE FROM scan_rds_instances; DELETE FROM scan_s3_buckets;
       DELETE FROM scans; DELETE FROM connections;`
    );
  });

  it('flags a running EC2 instance averaging under 5% CPU as IDLE_EC2 with matching severity', () => {
    const scanId = insertTestScan();
    insertEc2(scanId, { instanceId: 'i-1', instanceType: 't3.micro', state: 'running', avgCpu14d: 2 });

    generateFindings(scanId, 'us-east-1');

    const findings = findingsRepo.getFindings(scanId);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('IDLE_EC2');
    expect(findings[0].resource_id).toBe('i-1');
    expect(findings[0].severity).toBe('LOW');
  });

  it('does not flag a running EC2 instance with unknown (null) CPU', () => {
    const scanId = insertTestScan();
    insertEc2(scanId, { instanceId: 'i-1', instanceType: 't3.micro', state: 'running', avgCpu14d: null });

    generateFindings(scanId, 'us-east-1');

    expect(findingsRepo.getFindings(scanId)).toHaveLength(0);
  });

  it('does not flag a stopped EC2 instance even with low CPU', () => {
    const scanId = insertTestScan();
    insertEc2(scanId, { instanceId: 'i-1', instanceType: 't3.micro', state: 'stopped', avgCpu14d: 2 });

    generateFindings(scanId, 'us-east-1');

    expect(findingsRepo.getFindings(scanId)).toHaveLength(0);
  });

  it('does not flag an EC2 instance at exactly 5% CPU', () => {
    const scanId = insertTestScan();
    insertEc2(scanId, { instanceId: 'i-1', instanceType: 't3.micro', state: 'running', avgCpu14d: 5 });

    generateFindings(scanId, 'us-east-1');

    expect(findingsRepo.getFindings(scanId)).toHaveLength(0);
  });

  it('does not flag an EC2 instance with an unpriced instance type', () => {
    const scanId = insertTestScan();
    insertEc2(scanId, { instanceId: 'i-1', instanceType: 'p3.unknown', state: 'running', avgCpu14d: 1 });

    generateFindings(scanId, 'us-east-1');

    expect(findingsRepo.getFindings(scanId)).toHaveLength(0);
  });

  it('flags an unattached EBS volume and not an attached one', () => {
    const scanId = insertTestScan();
    insertEbs(scanId, { volumeId: 'vol-1', sizeGb: 100, attachmentStatus: 'unattached' });
    insertEbs(scanId, { volumeId: 'vol-2', sizeGb: 100, attachmentStatus: 'attached' });

    generateFindings(scanId, 'us-east-1');

    const findings = findingsRepo.getFindings(scanId);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('UNATTACHED_EBS');
    expect(findings[0].resource_id).toBe('vol-1');
  });

  it('flags an underutilized RDS instance recommending the next-smaller class', () => {
    const scanId = insertTestScan();
    insertRds(scanId, { dbInstanceId: 'db-1', instanceType: 'db.m5.xlarge', avgCpu14d: 8 });

    generateFindings(scanId, 'us-east-1');

    const findings = findingsRepo.getFindings(scanId);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('UNDERUTILIZED_RDS');
    expect(findings[0].recommendation_text).toContain('db.m5.large');
    expect(findings[0].estimated_monthly_savings).toBeCloseTo(0.342 * 730 - 0.171 * 730, 2);
  });

  it('does not flag an RDS instance already at the smallest size in its family', () => {
    const scanId = insertTestScan();
    insertRds(scanId, { dbInstanceId: 'db-1', instanceType: 'db.t4g.micro', avgCpu14d: 5 });

    generateFindings(scanId, 'us-east-1');

    expect(findingsRepo.getFindings(scanId)).toHaveLength(0);
  });

  it('does not flag an RDS instance at exactly 10% CPU', () => {
    const scanId = insertTestScan();
    insertRds(scanId, { dbInstanceId: 'db-1', instanceType: 'db.m5.xlarge', avgCpu14d: 10 });

    generateFindings(scanId, 'us-east-1');

    expect(findingsRepo.getFindings(scanId)).toHaveLength(0);
  });

  it('flags a large bucket with >10% growth over 30 days as LOW_ACTIVITY_S3', () => {
    const scanId = insertTestScan();
    insertS3(scanId, {
      bucketName: 'bucket-a',
      sizeBytes: 60 * GB,
      objectCount: 10,
      size30dAgoBytes: 50 * GB,
    });

    generateFindings(scanId, 'us-east-1');

    const findings = findingsRepo.getFindings(scanId);
    expect(findings).toHaveLength(1);
    expect(findings[0].category).toBe('LOW_ACTIVITY_S3');
    expect(findings[0].resource_id).toBe('bucket-a');
  });

  it('does not flag a large bucket with no 30-day baseline', () => {
    const scanId = insertTestScan();
    insertS3(scanId, {
      bucketName: 'bucket-a',
      sizeBytes: 60 * GB,
      objectCount: 10,
      size30dAgoBytes: null,
    });

    generateFindings(scanId, 'us-east-1');

    expect(findingsRepo.getFindings(scanId)).toHaveLength(0);
  });

  it('does not flag a bucket at or under 50GB even with high growth', () => {
    const scanId = insertTestScan();
    insertS3(scanId, {
      bucketName: 'bucket-a',
      sizeBytes: 50 * GB,
      objectCount: 10,
      size30dAgoBytes: 10 * GB,
    });

    generateFindings(scanId, 'us-east-1');

    expect(findingsRepo.getFindings(scanId)).toHaveLength(0);
  });

  it('does not flag a bucket with exactly 10% growth', () => {
    const scanId = insertTestScan();
    insertS3(scanId, {
      bucketName: 'bucket-a',
      sizeBytes: 55 * GB,
      objectCount: 10,
      size30dAgoBytes: 50 * GB,
    });

    generateFindings(scanId, 'us-east-1');

    expect(findingsRepo.getFindings(scanId)).toHaveLength(0);
  });

  it('maps severity boundaries correctly: exactly $100 HIGH, exactly $20 MEDIUM, $19.99 LOW', () => {
    const scanId = insertTestScan();
    // EBS pricing is sizeGb * $0.08/GB-mo at us-east-1 (multiplier 1.0) — exact cent control.
    insertEbs(scanId, { volumeId: 'vol-100', sizeGb: 1250, attachmentStatus: 'unattached' }); // $100.00
    insertEbs(scanId, { volumeId: 'vol-20', sizeGb: 250, attachmentStatus: 'unattached' }); // $20.00
    insertEbs(scanId, { volumeId: 'vol-19.99', sizeGb: 249.875, attachmentStatus: 'unattached' }); // $19.99

    generateFindings(scanId, 'us-east-1');

    const findings = findingsRepo.getFindings(scanId);
    const byId = Object.fromEntries(findings.map((f) => [f.resource_id, f]));
    expect(byId['vol-100'].estimated_monthly_savings).toBe(100);
    expect(byId['vol-100'].severity).toBe('HIGH');
    expect(byId['vol-20'].estimated_monthly_savings).toBe(20);
    expect(byId['vol-20'].severity).toBe('MEDIUM');
    expect(byId['vol-19.99'].estimated_monthly_savings).toBe(19.99);
    expect(byId['vol-19.99'].severity).toBe('LOW');
  });

  it('inserts zero rows and does not throw when there are no resources for the scan', () => {
    const scanId = insertTestScan();

    expect(() => generateFindings(scanId, 'us-east-1')).not.toThrow();
    expect(findingsRepo.getFindings(scanId)).toHaveLength(0);
  });
});
