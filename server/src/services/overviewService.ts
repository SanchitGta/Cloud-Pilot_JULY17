import * as connectionsRepo from '../repos/connectionsRepo.js';
import * as scansRepo from '../repos/scansRepo.js';
import * as scanResourcesRepo from '../repos/scanResourcesRepo.js';
import * as findingsRepo from '../repos/findingsRepo.js';
import type { OverviewResult } from '../types.js';

export function getOverview(): OverviewResult {
  const connection = connectionsRepo.getConnection();
  if (connection === null) {
    return { status: 'NOT_CONNECTED' };
  }

  // Latest completed scan for THIS connection's id (not just the latest scan
  // row) so this stays correct if a future story adds re-scans.
  const scan = scansRepo.getLatestSucceededScan(connection.id);
  if (scan === null) {
    // Covers PENDING / RUNNING / FAILED-with-no-prior-success — a scans row
    // exists synchronously at connect time; collectors/findings run async.
    return { status: 'AWAITING_FIRST_SCAN' };
  }

  const totalResourcesScanned = scanResourcesRepo.countResources(scan.id);
  const summary = findingsRepo.getFindingsSummary(scan.id);

  return {
    status: 'READY',
    metrics: {
      totalResourcesScanned,
      totalMonthlySavings: summary.totalMonthlySavings,
      totalFindings: summary.count,
      scanId: scan.id,
      // A SUCCEEDED scan always has completed_at set — markSucceeded sets
      // status and completed_at in the same UPDATE ... RETURNING *.
      scanCompletedAt: scan.completed_at!,
    },
  };
}
