process.env.CONNECTION_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64');
process.env.DB_PATH = ':memory:';

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../src/db/index.js';
import * as findingsRepo from '../src/repos/findingsRepo.js';
import * as explanationClient from '../src/services/explanationClient.js';
import { generateExplanations } from '../src/services/explanationService.js';

vi.mock('../src/services/explanationClient.js', () => ({
  generateExplanation: vi.fn(),
}));

function insertTestScan(): number {
  const db = getDb();
  const conn = db
    .prepare(
      `INSERT INTO connections (access_key_id, encrypted_secret_key, region, aws_account_id, aws_arn)
       VALUES ('AKIAEXAMPLE', 'enc', 'us-east-1', '123456789012', 'arn:aws:iam::123456789012:user/test')
       RETURNING *`
    )
    .get() as { id: number };
  const scan = db
    .prepare(`INSERT INTO scans (connection_id, status) VALUES (?, 'RUNNING') RETURNING *`)
    .get(conn.id) as { id: number };
  return scan.id;
}

function insertFinding(
  scanId: number,
  opts: {
    resourceType?: string;
    resourceId?: string;
    category?: string;
    severity?: string;
    estimatedMonthlySavings?: number;
    recommendationText?: string;
  } = {}
): number {
  const db = getDb();
  const row = db
    .prepare(
      `INSERT INTO findings (scan_id, resource_type, resource_id, category, severity, estimated_monthly_savings, recommendation_text)
       VALUES (?,?,?,?,?,?,?)
       RETURNING *`
    )
    .get(
      scanId,
      opts.resourceType ?? 'EC2',
      opts.resourceId ?? 'i-1',
      opts.category ?? 'IDLE_EC2',
      opts.severity ?? 'LOW',
      opts.estimatedMonthlySavings ?? 10,
      opts.recommendationText ?? 'Stop instance i-1; it averaged 2.0% CPU over the last 14 days.'
    ) as { id: number };
  return row.id;
}

describe('explanationService.generateExplanations', () => {
  beforeEach(() => {
    const db = getDb();
    db.exec(`DELETE FROM findings; DELETE FROM scans; DELETE FROM connections;`);
    vi.mocked(explanationClient.generateExplanation).mockReset();
  });

  it('writes the returned explanation back for a finding whose generateExplanation resolves', async () => {
    const scanId = insertTestScan();
    const findingId = insertFinding(scanId);
    vi.mocked(explanationClient.generateExplanation).mockResolvedValue('Plain-language explanation.');

    await generateExplanations(scanId);

    expect(explanationClient.generateExplanation).toHaveBeenCalledTimes(1);
    expect(findingsRepo.getFinding(findingId)!.explanation).toBe('Plain-language explanation.');
  });

  it('leaves explanation NULL and does not throw when generateExplanation rejects', async () => {
    const scanId = insertTestScan();
    const findingId = insertFinding(scanId);
    vi.mocked(explanationClient.generateExplanation).mockRejectedValue(new Error('LLM down'));

    await expect(generateExplanations(scanId)).resolves.toBeUndefined();

    expect(findingsRepo.getFinding(findingId)!.explanation).toBeNull();
  });

  it('isolates per-finding failures: a rejected call does not stop a successful one from being written', async () => {
    const scanId = insertTestScan();
    // getFindings orders by estimated_monthly_savings DESC, so the higher-savings
    // finding is processed first — make that one fail, the second one succeed.
    const failId = insertFinding(scanId, { resourceId: 'i-fail', estimatedMonthlySavings: 50 });
    const okId = insertFinding(scanId, { resourceId: 'i-ok', estimatedMonthlySavings: 10 });
    vi.mocked(explanationClient.generateExplanation)
      .mockRejectedValueOnce(new Error('LLM down'))
      .mockResolvedValueOnce('Explanation for the second finding.');

    await generateExplanations(scanId);

    expect(explanationClient.generateExplanation).toHaveBeenCalledTimes(2);
    expect(findingsRepo.getFinding(failId)!.explanation).toBeNull();
    expect(findingsRepo.getFinding(okId)!.explanation).toBe('Explanation for the second finding.');
  });

  it('resolves without calling generateExplanation when the scan has zero findings', async () => {
    const scanId = insertTestScan();

    await expect(generateExplanations(scanId)).resolves.toBeUndefined();

    expect(explanationClient.generateExplanation).not.toHaveBeenCalled();
  });
});
