import { getDb } from '../db/index.js';
import * as connectionsRepo from '../repos/connectionsRepo.js';
import * as scansRepo from '../repos/scansRepo.js';
import * as scanResourcesRepo from '../repos/scanResourcesRepo.js';
import * as ec2Collector from '../collectors/ec2Collector.js';
import * as ebsCollector from '../collectors/ebsCollector.js';
import * as rdsCollector from '../collectors/rdsCollector.js';
import * as s3Collector from '../collectors/s3Collector.js';
import type {
  AwsCredentials,
  Ec2InstanceData,
  EbsVolumeData,
  RdsInstanceData,
  S3BucketData,
} from '../types.js';

async function withLabel<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${label} failed: ${message}`);
  }
}

export async function runScan(scanId: number): Promise<void> {
  const creds: AwsCredentials | null = connectionsRepo.getDecryptedCredentials();
  if (!creds) {
    scansRepo.markFailed(scanId, 'No AWS connection found.');
    return;
  }

  try {
    const [ec2Data, ebsData, rdsData, s3Data] = await Promise.all([
      withLabel<Ec2InstanceData[]>('EC2 collector', () => ec2Collector.collect(creds)),
      withLabel<EbsVolumeData[]>('EBS collector', () => ebsCollector.collect(creds)),
      withLabel<RdsInstanceData[]>('RDS collector', () => rdsCollector.collect(creds)),
      withLabel<S3BucketData[]>('S3 collector', () => s3Collector.collect(creds)),
    ]);

    const db = getDb();
    db.transaction(() => {
      scanResourcesRepo.insertEc2Instances(db, scanId, ec2Data);
      scanResourcesRepo.insertEbsVolumes(db, scanId, ebsData);
      scanResourcesRepo.insertRdsInstances(db, scanId, rdsData);
      scanResourcesRepo.insertS3Buckets(db, scanId, s3Data);
    })();

    scansRepo.markSucceeded(scanId);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    scansRepo.markFailed(scanId, message);
  }
}
