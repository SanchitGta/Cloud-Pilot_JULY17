import { Router } from 'express';
import * as overviewService from '../services/overviewService.js';
import type { OverviewResult } from '../types.js';

export const overviewRouter = Router();

function toOverviewResponse(result: OverviewResult) {
  // "not connected" / "not ready" are valid, expected responses — always 200,
  // never error codes, consistent with GET /api/connections/current.
  if (result.status !== 'READY') {
    return { status: result.status, overview: null };
  }
  return { status: 'READY', overview: { ...result.metrics } };
}

overviewRouter.get('/overview', (_req, res, next) => {
  try {
    const result = overviewService.getOverview();
    res.status(200).json(toOverviewResponse(result));
  } catch (err) {
    next(err);
  }
});
