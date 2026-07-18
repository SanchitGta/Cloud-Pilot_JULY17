process.env.CONNECTION_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
process.env.DB_PATH = ':memory:';

import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb } from '../src/db/index.js';
import { connectionsRouter } from '../src/routes/connections.js';
import { regionsRouter } from '../src/routes/regions.js';
import * as awsValidation from '../src/services/awsValidation.js';

vi.mock('../src/services/awsValidation.js', () => ({
  validateCredentials: vi.fn(),
}));

vi.mock('../src/services/scanOrchestrator.js', () => ({
  runScan: vi.fn().mockResolvedValue(undefined),
}));

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', connectionsRouter);
  app.use('/api', regionsRouter);
  return app;
}

const validBody = {
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'shh-its-a-secret',
  region: 'us-east-1',
};

describe('connections API', () => {
  const app = buildApp();

  beforeEach(() => {
    const db = getDb();
    db.exec('DELETE FROM scans; DELETE FROM connections;');
    vi.mocked(awsValidation.validateCredentials).mockReset();
  });

  it('GET /api/regions returns the region list', async () => {
    const res = await request(app).get('/api/regions');

    expect(res.status).toBe(200);
    expect(res.body).toContain('us-east-1');
  });

  it('GET /api/connections/current returns null when nothing is connected', async () => {
    const res = await request(app).get('/api/connections/current');

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ connection: null });
  });

  it('POST /api/connections returns 201 and the connection+scan on success, never leaking the secret', async () => {
    vi.mocked(awsValidation.validateCredentials).mockResolvedValue({
      ok: true,
      accountId: '123456789012',
      arn: 'arn:aws:iam::123456789012:user/test',
    });

    const res = await request(app).post('/api/connections').send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.connection).toMatchObject({
      awsAccountId: '123456789012',
      region: 'us-east-1',
    });
    expect(res.body.scan).toMatchObject({ status: 'RUNNING' });
    expect(JSON.stringify(res.body)).not.toContain('shh-its-a-secret');

    const current = await request(app).get('/api/connections/current');
    expect(current.body.connection.awsAccountId).toBe('123456789012');
  });

  it('POST /api/connections returns 422 with a specific message on AWS rejection', async () => {
    vi.mocked(awsValidation.validateCredentials).mockResolvedValue({
      ok: false,
      message: 'The Secret Access Key is incorrect.',
    });

    const res = await request(app).post('/api/connections').send(validBody);

    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      error: { code: 'AWS_CREDENTIALS_REJECTED', message: 'The Secret Access Key is incorrect.' },
    });

    const current = await request(app).get('/api/connections/current');
    expect(current.body).toEqual({ connection: null });
  });

  it('POST /api/connections returns 400 for a missing field', async () => {
    const res = await request(app)
      .post('/api/connections')
      .send({ accessKeyId: '', secretAccessKey: 'x', region: 'us-east-1' });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(awsValidation.validateCredentials).not.toHaveBeenCalled();
  });

  it('POST /api/connections returns 409 when a connection already exists', async () => {
    vi.mocked(awsValidation.validateCredentials).mockResolvedValue({
      ok: true,
      accountId: '123456789012',
      arn: 'arn:aws:iam::123456789012:user/test',
    });

    const first = await request(app).post('/api/connections').send(validBody);
    expect(first.status).toBe(201);

    const second = await request(app).post('/api/connections').send(validBody);

    expect(second.status).toBe(409);
    expect(second.body).toEqual({
      error: { code: 'CONNECTION_EXISTS', message: 'An AWS account is already connected.' },
    });
  });
});
