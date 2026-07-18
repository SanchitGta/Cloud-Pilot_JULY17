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

export type FindingResourceType = 'EC2' | 'EBS' | 'RDS' | 'S3';
export type FindingCategory =
  | 'IDLE_EC2'
  | 'UNATTACHED_EBS'
  | 'UNDERUTILIZED_RDS'
  | 'LOW_ACTIVITY_S3';
export type FindingSeverity = 'LOW' | 'MEDIUM' | 'HIGH';

export interface Finding {
  id: number;
  resourceType: FindingResourceType;
  resourceId: string;
  category: FindingCategory;
  severity: FindingSeverity;
  estimatedMonthlySavings: number;
  recommendationText: string;
  explanation: string | null;
  createdAt: string;
}

export interface FindingsResponse {
  status: OverviewStatus;
  scanId?: number;
  scanCompletedAt?: string;
  findings: Finding[] | null;
}
