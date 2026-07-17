import { Router } from 'express';
import * as connectionsRepo from '../repos/connectionsRepo.js';
import * as connectionsService from '../services/connectionsService.js';
import type { ConnectionRow } from '../types.js';

export const connectionsRouter = Router();

function toConnectionResponse(row: ConnectionRow) {
  return {
    id: row.id,
    region: row.region,
    awsAccountId: row.aws_account_id,
    awsArn: row.aws_arn,
    createdAt: row.created_at,
  };
}

connectionsRouter.post('/connections', async (req, res, next) => {
  try {
    const { accessKeyId, secretAccessKey, region } = req.body ?? {};
    const result = await connectionsService.connect({ accessKeyId, secretAccessKey, region });

    switch (result.kind) {
      case 'success':
        res.status(201).json({
          connection: toConnectionResponse(result.connection),
          scan: {
            id: result.scan.id,
            status: result.scan.status,
            createdAt: result.scan.created_at,
          },
        });
        return;
      case 'validation_error':
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: result.message } });
        return;
      case 'conflict':
        res.status(409).json({ error: { code: 'CONNECTION_EXISTS', message: result.message } });
        return;
      case 'aws_rejected':
        res
          .status(422)
          .json({ error: { code: 'AWS_CREDENTIALS_REJECTED', message: result.message } });
        return;
    }
  } catch (err) {
    next(err);
  }
});

connectionsRouter.get('/connections/current', (_req, res, next) => {
  try {
    const connection = connectionsRepo.getConnection();
    res.status(200).json({ connection: connection ? toConnectionResponse(connection) : null });
  } catch (err) {
    next(err);
  }
});
