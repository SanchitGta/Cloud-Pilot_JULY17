import type Database from 'better-sqlite3';
import { getDb } from '../db/index.js';
import type { ScanRow } from '../types.js';

export function insertScan(tx: Database.Database, connectionId: number): ScanRow {
  const row = tx
    .prepare(
      `INSERT INTO scans (connection_id, status) VALUES (?, 'PENDING') RETURNING *`
    )
    .get(connectionId) as ScanRow;
  return row;
}

export function markRunning(tx: Database.Database, scanId: number): ScanRow {
  const row = tx
    .prepare(
      `UPDATE scans SET status = 'RUNNING', started_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
       WHERE id = ? RETURNING *`
    )
    .get(scanId) as ScanRow;
  return row;
}

export function getScan(scanId: number): ScanRow | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM scans WHERE id = ?').get(scanId) as ScanRow | undefined;
  return row ?? null;
}
