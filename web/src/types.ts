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
