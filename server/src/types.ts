export interface ConnectionRow {
  id: number;
  access_key_id: string;
  encrypted_secret_key: string;
  region: string;
  aws_account_id: string;
  aws_arn: string;
  created_at: string;
}

export type ScanStatus = 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';

export interface ScanRow {
  id: number;
  connection_id: number;
  status: ScanStatus;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface ConnectInput {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export type ConnectResult =
  | { kind: 'validation_error'; message: string }
  | { kind: 'conflict'; message: string }
  | { kind: 'aws_rejected'; message: string }
  | { kind: 'success'; connection: ConnectionRow; scan: ScanRow };

// Shared credential shape — same as connectionsRepo.getDecryptedCredentials() return
export interface AwsCredentials {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

// DB row types
export interface Ec2InstanceRow {
  id: number;
  scan_id: number;
  instance_id: string;
  instance_type: string;
  state: string;
  avg_cpu_14d: number | null;
  created_at: string;
}
export interface EbsVolumeRow {
  id: number;
  scan_id: number;
  volume_id: string;
  size_gb: number;
  attachment_status: 'attached' | 'unattached';
  created_at: string;
}
export interface RdsInstanceRow {
  id: number;
  scan_id: number;
  db_instance_id: string;
  instance_type: string;
  avg_cpu_14d: number | null;
  created_at: string;
}
export interface S3BucketRow {
  id: number;
  scan_id: number;
  bucket_name: string;
  size_bytes: number;
  object_count: number;
  size_30d_ago_bytes: number | null;
  created_at: string;
}

// In-memory collector output (before DB insert)
export interface Ec2InstanceData {
  instanceId: string;
  instanceType: string;
  state: string;
  avgCpu14d: number | null;
}
export interface EbsVolumeData {
  volumeId: string;
  sizeGb: number;
  attachmentStatus: 'attached' | 'unattached';
}
export interface RdsInstanceData {
  dbInstanceId: string;
  instanceType: string;
  avgCpu14d: number | null;
}
export interface S3BucketData {
  bucketName: string;
  sizeBytes: number;
  objectCount: number;
  size30dAgoBytes: number | null;
}
