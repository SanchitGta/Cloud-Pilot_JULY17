import type Database from 'better-sqlite3';
import { getDb } from '../db/index.js';
import { loadEnv } from '../env.js';
import { decrypt } from '../lib/encryption.js';
import type { ConnectionRow } from '../types.js';

export interface InsertConnectionInput {
  accessKeyId: string;
  encryptedSecretKey: string;
  region: string;
  awsAccountId: string;
  awsArn: string;
}

export function getConnection(): ConnectionRow | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM connections LIMIT 1').get() as ConnectionRow | undefined;
  return row ?? null;
}

export function insertConnection(
  tx: Database.Database,
  input: InsertConnectionInput
): ConnectionRow {
  const row = tx
    .prepare(
      `INSERT INTO connections (access_key_id, encrypted_secret_key, region, aws_account_id, aws_arn)
       VALUES (@accessKeyId, @encryptedSecretKey, @region, @awsAccountId, @awsArn)
       RETURNING *`
    )
    .get(input) as ConnectionRow;
  return row;
}

export function getDecryptedCredentials(): {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
} | null {
  const row = getConnection();
  if (!row) {
    return null;
  }

  const env = loadEnv();
  const secretAccessKey = decrypt(row.encrypted_secret_key, env.encryptionKey);

  return {
    accessKeyId: row.access_key_id,
    secretAccessKey,
    region: row.region,
  };
}
