import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from '../env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) {
    return db;
  }

  const env = loadEnv();
  const dir = dirname(env.dbPath);
  if (dir && !existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  db = new Database(env.dbPath);
  db.pragma('journal_mode = WAL');

  const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);

  // Idempotent migration: add scans.trigger for databases created before this column existed.
  // CREATE TABLE IF NOT EXISTS is a no-op once the table exists, so schema.sql alone won't
  // add this column to any already-existing .db file — and this project has no migration runner.
  const scanColumns = db.prepare('PRAGMA table_info(scans)').all() as { name: string }[];
  if (!scanColumns.some((c) => c.name === 'trigger')) {
    db.exec(
      `ALTER TABLE scans ADD COLUMN trigger TEXT NOT NULL DEFAULT 'AUTOMATIC' CHECK (trigger IN ('AUTOMATIC','MANUAL'))`
    );
  }

  return db;
}
