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
