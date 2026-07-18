import type Database from 'better-sqlite3';
import { getDb } from '../db/index.js';
import type { FindingData, FindingRow, FindingsSummary } from '../types.js';

export function insertFindings(
  tx: Database.Database,
  scanId: number,
  rows: FindingData[]
): void {
  const stmt = tx.prepare(
    `INSERT INTO findings (scan_id, resource_type, resource_id, category, severity, estimated_monthly_savings, recommendation_text)
     VALUES (?,?,?,?,?,?,?)`
  );
  for (const row of rows) {
    stmt.run(
      scanId,
      row.resourceType,
      row.resourceId,
      row.category,
      row.severity,
      row.estimatedMonthlySavings,
      row.recommendationText
    );
  }
}

export function getFindings(scanId: number): FindingRow[] {
  const db = getDb();
  return db
    .prepare('SELECT * FROM findings WHERE scan_id=? ORDER BY estimated_monthly_savings DESC')
    .all(scanId) as FindingRow[];
}

export function getFinding(id: number): FindingRow | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM findings WHERE id=?').get(id) as FindingRow | undefined;
  return row ?? null;
}

export function updateExplanation(id: number, explanation: string): FindingRow {
  const db = getDb();
  return db
    .prepare('UPDATE findings SET explanation=? WHERE id=? RETURNING *')
    .get(explanation, id) as FindingRow;
}

export function getFindingsSummary(scanId: number): FindingsSummary {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) as count, COALESCE(SUM(estimated_monthly_savings),0) as totalMonthlySavings
       FROM findings WHERE scan_id=?`
    )
    .get(scanId) as { count: number; totalMonthlySavings: number };
  return { count: row.count, totalMonthlySavings: row.totalMonthlySavings };
}

// Unlike getFindingsSummary (which COALESCEs to zero for a single scan), a scan_id
// with zero findings has no row in the GROUP BY output and is simply absent from the
// returned Map. Callers must treat a missing key as { count: 0, totalMonthlySavings: 0 }.
export function getFindingsSummaryByScanIds(
  scanIds: number[]
): Map<number, FindingsSummary> {
  if (scanIds.length === 0) {
    return new Map();
  }
  const db = getDb();
  const placeholders = scanIds.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT scan_id as scanId, COUNT(*) as count, SUM(estimated_monthly_savings) as totalMonthlySavings
       FROM findings WHERE scan_id IN (${placeholders}) GROUP BY scan_id`
    )
    .all(...scanIds) as { scanId: number; count: number; totalMonthlySavings: number }[];
  const result = new Map<number, FindingsSummary>();
  for (const row of rows) {
    result.set(row.scanId, { count: row.count, totalMonthlySavings: row.totalMonthlySavings });
  }
  return result;
}
