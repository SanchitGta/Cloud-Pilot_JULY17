export interface Connection {
  id: number;
  region: string;
  awsAccountId: string;
  awsArn: string;
  createdAt: string;
}

export type ScanTrigger = 'AUTOMATIC' | 'MANUAL';

export interface ScanHistoryEntry {
  id: number;
  status: Scan['status'];
  trigger: ScanTrigger;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
  findingsCount: number | null;
  estimatedMonthlySavings: number | null;
}

export interface ScanHistoryResponse {
  scans: ScanHistoryEntry[];
}

export interface RescanResponse {
  scan: {
    id: number;
    status: Scan['status'];
    trigger: ScanTrigger;
    createdAt: string;
  };
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
