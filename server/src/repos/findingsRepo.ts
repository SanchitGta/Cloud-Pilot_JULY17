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
