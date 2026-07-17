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

  return db;
}
