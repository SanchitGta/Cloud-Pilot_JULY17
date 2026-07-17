process.env.CONNECTION_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.DB_PATH = ':memory:';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../src/db/index.js';
import * as awsValidation from '../src/services/awsValidation.js';
import { connect } from '../src/services/connectionsService.js';

vi.mock('../src/services/awsValidation.js', () => ({
  validateCredentials: vi.fn(),
}));

const validInput = {
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'shh-its-a-secret',
  region: 'us-east-1',
};

function countRows(table: 'connections' | 'scans'): number {
  const db = getDb();
  const row = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
  return row.count;
}

describe('connectionsService.connect', () => {
  beforeEach(() => {
    const db = getDb();
    db.exec('DELETE FROM scans; DELETE FROM connections;');
    vi.mocked(awsValidation.validateCredentials).mockReset();
  });

  it('persists a connection and a RUNNING scan on successful validation', async () => {
    vi.mocked(awsValidation.validateCredentials).mockResolvedValue({
      ok: true,
      accountId: '123456789012',
      arn: 'arn:aws:iam::123456789012:user/test',
    });

    const result = await connect(validInput);

    expect(result.kind).toBe('success');
    expect(countRows('connections')).toBe(1);
    expect(countRows('scans')).toBe(1);

    if (result.kind === 'success') {
      expect(result.scan.status).toBe('RUNNING');
      expect(result.scan.started_at).not.toBeNull();
      expect(result.connection.aws_account_id).toBe('123456789012');
    }
  });

  it('persists nothing when AWS validation fails', async () => {
    vi.mocked(awsValidation.validateCredentials).mockResolvedValue({
      ok: false,
      message: 'The Access Key ID is invalid or does not exist.',
    });

    const result = await connect(validInput);

    expect(result).toEqual({
      kind: 'aws_rejected',
      message: 'The Access Key ID is invalid or does not exist.',
    });
    expect(countRows('connections')).toBe(0);
    expect(countRows('scans')).toBe(0);
  });

  it('rejects a second connection attempt as a conflict without calling AWS', async () => {
    vi.mocked(awsValidation.validateCredentials).mockResolvedValue({
      ok: true,
      accountId: '123456789012',
      arn: 'arn:aws:iam::123456789012:user/test',
    });

    const first = await connect(validInput);
    expect(first.kind).toBe('success');

    vi.mocked(awsValidation.validateCredentials).mockReset();

    const second = await connect(validInput);

    expect(second).toEqual({
      kind: 'conflict',
      message: 'An AWS account is already connected.',
    });
    expect(awsValidation.validateCredentials).not.toHaveBeenCalled();
    expect(countRows('connections')).toBe(1);
    expect(countRows('scans')).toBe(1);
  });

  it('returns a validation error for a malformed region without touching AWS or the db', async () => {
    const result = await connect({ ...validInput, region: 'not-a-region' });

    expect(result.kind).toBe('validation_error');
    expect(awsValidation.validateCredentials).not.toHaveBeenCalled();
    expect(countRows('connections')).toBe(0);
  });
});
