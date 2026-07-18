import { getDb } from '../db/index.js';
import { loadEnv } from '../env.js';
import { encrypt } from '../lib/encryption.js';
import * as connectionsRepo from '../repos/connectionsRepo.js';
import * as scansRepo from '../repos/scansRepo.js';
import type { ConnectInput, ConnectResult } from '../types.js';
import { isValidRegion } from '../constants/awsRegions.js';
import * as awsValidation from './awsValidation.js';
import { runScan } from './scanOrchestrator.js';

export async function connect(input: ConnectInput): Promise<ConnectResult> {
  if (!input.accessKeyId || !input.accessKeyId.trim()) {
    return { kind: 'validation_error', message: 'Access Key ID is required.' };
  }
  if (!input.secretAccessKey || !input.secretAccessKey.trim()) {
    return { kind: 'validation_error', message: 'Secret Access Key is required.' };
  }
  if (!input.region || !isValidRegion(input.region)) {
    return { kind: 'validation_error', message: `"${input.region}" is not a recognized AWS region.` };
  }

  if (connectionsRepo.getConnection() !== null) {
    return { kind: 'conflict', message: 'An AWS account is already connected.' };
  }

  const awsResult = await awsValidation.validateCredentials(input);
  if (!awsResult.ok) {
    return { kind: 'aws_rejected', message: awsResult.message };
  }

  // Nothing persisted yet — validation happened before any write, satisfying
  // "on failed validation ... no partial connection state is persisted".
  const env = loadEnv();
  const db = getDb();

  const result = db.transaction(() => {
    const encryptedSecretKey = encrypt(input.secretAccessKey, env.encryptionKey);
    const connection = connectionsRepo.insertConnection(db, {
      accessKeyId: input.accessKeyId,
      encryptedSecretKey,
      region: input.region,
      awsAccountId: awsResult.accountId,
      awsArn: awsResult.arn,
    });
    let scan = scansRepo.insertScan(db, connection.id, 'AUTOMATIC');
    scan = scansRepo.markRunning(db, scan.id);
    return { connection, scan };
  })();

  void runScan(result.scan.id).catch((err) => {
    console.error(`Unexpected error in runScan for scan ${result.scan.id}:`, err);
  });

  return { kind: 'success', connection: result.connection, scan: result.scan };
}
