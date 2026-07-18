import type Database from 'better-sqlite3';
import { getDb } from '../db/index.js';
import type {
  Ec2InstanceData,
  Ec2InstanceRow,
  EbsVolumeData,
  EbsVolumeRow,
  RdsInstanceData,
  RdsInstanceRow,
  S3BucketData,
  S3BucketRow,
} from '../types.js';

export function insertEc2Instances(
  tx: Database.Database,
  scanId: number,
  rows: Ec2InstanceData[]
): void {
  const stmt = tx.prepare(
    `INSERT INTO scan_ec2_instances (scan_id, instance_id, instance_type, state, avg_cpu_14d)
     VALUES (?,?,?,?,?)`
  );
  for (const row of rows) {
    stmt.run(scanId, row.instanceId, row.instanceType, row.state, row.avgCpu14d);
  }
}

export function insertEbsVolumes(
  tx: Database.Database,
  scanId: number,
  rows: EbsVolumeData[]
): void {
  const stmt = tx.prepare(
    `INSERT INTO scan_ebs_volumes (scan_id, volume_id, size_gb, attachment_status)
     VALUES (?,?,?,?)`
  );
  for (const row of rows) {
    stmt.run(scanId, row.volumeId, row.sizeGb, row.attachmentStatus);
  }
}

export function insertRdsInstances(
  tx: Database.Database,
  scanId: number,
  rows: RdsInstanceData[]
): void {
  const stmt = tx.prepare(
    `INSERT INTO scan_rds_instances (scan_id, db_instance_id, instance_type, avg_cpu_14d)
     VALUES (?,?,?,?)`
  );
  for (const row of rows) {
    stmt.run(scanId, row.dbInstanceId, row.instanceType, row.avgCpu14d);
  }
}

export function insertS3Buckets(
  tx: Database.Database,
  scanId: number,
  rows: S3BucketData[]
): void {
  const stmt = tx.prepare(
    `INSERT INTO scan_s3_buckets (scan_id, bucket_name, size_bytes, object_count, size_30d_ago_bytes)
     VALUES (?,?,?,?,?)`
  );
  for (const row of rows) {
    stmt.run(scanId, row.bucketName, row.sizeBytes, row.objectCount, row.size30dAgoBytes);
  }
}

export function getEc2Instances(scanId: number): Ec2InstanceRow[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM scan_ec2_instances WHERE scan_id=? ORDER BY instance_id')
    .all(scanId) as Ec2InstanceRow[];
}

export function getEbsVolumes(scanId: number): EbsVolumeRow[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM scan_ebs_volumes WHERE scan_id=? ORDER BY volume_id')
    .all(scanId) as EbsVolumeRow[];
}

export function getRdsInstances(scanId: number): RdsInstanceRow[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM scan_rds_instances WHERE scan_id=? ORDER BY db_instance_id')
    .all(scanId) as RdsInstanceRow[];
}

export function getS3Buckets(scanId: number): S3BucketRow[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM scan_s3_buckets WHERE scan_id=? ORDER BY bucket_name')
    .all(scanId) as S3BucketRow[];
}

// Combined count across all four resource tables for one scan — aggregated in
// SQL (single round trip), matching the getFindingsSummary precedent.
export function countResources(scanId: number): number {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM scan_ec2_instances WHERE scan_id = ?) +
         (SELECT COUNT(*) FROM scan_ebs_volumes   WHERE scan_id = ?) +
         (SELECT COUNT(*) FROM scan_rds_instances WHERE scan_id = ?) +
         (SELECT COUNT(*) FROM scan_s3_buckets    WHERE scan_id = ?) AS total`
    )
    .get(scanId, scanId, scanId, scanId) as { total: number };
  return row.total;
}
