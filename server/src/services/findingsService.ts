import * as connectionsRepo from '../repos/connectionsRepo.js';
import * as scansRepo from '../repos/scansRepo.js';
import * as findingsRepo from '../repos/findingsRepo.js';
import type { FindingsResult } from '../types.js';

export function getFindings(): FindingsResult {
  const connection = connectionsRepo.getConnection();
  if (connection === null) {
    return { status: 'NOT_CONNECTED' };
  }

  const scan = scansRepo.getLatestSucceededScan(connection.id);
  if (scan === null) {
    return { status: 'AWAITING_FIRST_SCAN' };
  }

  const findings = findingsRepo.getFindings(scan.id);

  return {
    status: 'READY',
    scanId: scan.id,
    // A SUCCEEDED scan always has completed_at set — markSucceeded sets
    // status and completed_at in the same UPDATE ... RETURNING *.
    scanCompletedAt: scan.completed_at!,
    findings,
  };
}
