export interface Connection {
  id: number;
  region: string;
  awsAccountId: string;
  awsArn: string;
  createdAt: string;
}

export interface Scan {
  id: number;
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  createdAt: string;
}

export interface ApiError {
  code: string;
  message: string;
}

export type OverviewStatus = 'NOT_CONNECTED' | 'AWAITING_FIRST_SCAN' | 'READY';

export interface OverviewMetrics {
  totalResourcesScanned: number;
  totalMonthlySavings: number;
  totalFindings: number;
  scanId: number;
  scanCompletedAt: string;
}

export interface OverviewResponse {
  status: OverviewStatus;
  overview: OverviewMetrics | null;
}
