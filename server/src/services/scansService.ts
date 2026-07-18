import { getDb } from '../db/index.js';
import * as connectionsRepo from '../repos/connectionsRepo.js';
import * as scansRepo from '../repos/scansRepo.js';
import * as findingsRepo from '../repos/findingsRepo.js';
import type { ScanHistoryEntry, RescanResult } from '../types.js';
import { runScan } from './scanOrchestrator.js';

export function getScanHistory(): ScanHistoryEntry[] {
  const connection = connectionsRepo.getConnection();
  if (connection === null) {
    return [];
  }

  const scans = scansRepo.listScans(connection.id);
  const succeededIds = scans.filter((s) => s.status === 'SUCCEEDED').map((s) => s.id);
  const summaries = findingsRepo.getFindingsSummaryByScanIds(succeededIds);

  return scans.map((scan) => {
    let findingsCount: number | null = null;
    let estimatedMonthlySavings: number | null = null;
    if (scan.status === 'SUCCEEDED') {
      const summary = summaries.get(scan.id) ?? { count: 0, totalMonthlySavings: 0 };
      findingsCount = summary.count;
      estimatedMonthlySavings = summary.totalMonthlySavings;
    }
    return {
      id: scan.id,
      status: scan.status,
      trigger: scan.trigger,
      createdAt: scan.created_at,
      completedAt: scan.completed_at,
      errorMessage: scan.error_message,
      findingsCount,
      estimatedMonthlySavings,
    };
  });
}

export function startRescan(): RescanResult {
  const connection = connectionsRepo.getConnection();
  if (connection === null) {
    return { kind: 'no_connection', message: 'Connect an AWS account before running a scan.' };
  }

  const active = scansRepo.getActiveScan(connection.id);
  if (active !== null) {
    return { kind: 'scan_in_progress', message: 'A scan is already running.' };
  }

  const db = getDb();
  const scan = db.transaction(() => {
    let s = scansRepo.insertScan(db, connection.id, 'MANUAL');
    s = scansRepo.markRunning(db, s.id);
    return s;
  })();

  void runScan(scan.id).catch((err) => {
    console.error(`Unexpected error in runScan for scan ${scan.id}:`, err);
  });

  return { kind: 'success', scan };
}
