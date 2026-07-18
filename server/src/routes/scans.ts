import { Router } from 'express';
import * as scansService from '../services/scansService.js';

export const scansRouter = Router();

scansRouter.get('/scans', (_req, res, next) => {
  try {
    const scans = scansService.getScanHistory();
    res.status(200).json({ scans });
  } catch (err) {
    next(err);
  }
});

scansRouter.post('/scans', (_req, res, next) => {
  try {
    const result = scansService.startRescan();

    switch (result.kind) {
      case 'success':
        res.status(201).json({
          scan: {
            id: result.scan.id,
            status: result.scan.status,
            trigger: result.scan.trigger,
            createdAt: result.scan.created_at,
          },
        });
        return;
      case 'no_connection':
        res.status(409).json({ error: { code: 'NO_CONNECTION', message: result.message } });
        return;
      case 'scan_in_progress':
        res.status(409).json({ error: { code: 'SCAN_IN_PROGRESS', message: result.message } });
        return;
    }
  } catch (err) {
    next(err);
  }
});
