import dotenv from 'dotenv';

export interface Env {
  port: number;
  dbPath: string;
  encryptionKey: Buffer;
}

let cachedEnv: Env | null = null;

export function loadEnv(): Env {
  if (cachedEnv) {
    return cachedEnv;
  }

  dotenv.config();

  const rawKey = process.env.CONNECTION_ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error('CONNECTION_ENCRYPTION_KEY must be a 32-byte base64 string');
  }

  const encryptionKey = Buffer.from(rawKey, 'base64');
  if (encryptionKey.length !== 32) {
    throw new Error('CONNECTION_ENCRYPTION_KEY must be a 32-byte base64 string');
  }

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  const dbPath = process.env.DB_PATH ?? './data/cloudpilot.db';

  cachedEnv = { port, dbPath, encryptionKey };
  return cachedEnv;
}
