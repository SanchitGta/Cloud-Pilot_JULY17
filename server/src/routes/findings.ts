import { Router } from 'express';
import * as findingsService from '../services/findingsService.js';
import type { FindingRow } from '../types.js';

export const findingsRouter = Router();

function toFindingResponse(row: FindingRow) {
  return {
    id: row.id,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    category: row.category,
    severity: row.severity,
    estimatedMonthlySavings: row.estimated_monthly_savings,
    recommendationText: row.recommendation_text,
    explanation: row.explanation,
    createdAt: row.created_at,
  };
}

findingsRouter.get('/findings', (_req, res, next) => {
  try {
    const result = findingsService.getFindings();
    if (result.status !== 'READY') {
      res.status(200).json({ status: result.status, findings: null });
      return;
    }
    res.status(200).json({
      status: 'READY',
      scanId: result.scanId,
      scanCompletedAt: result.scanCompletedAt,
      findings: result.findings.map(toFindingResponse),
    });
  } catch (err) {
    next(err);
  }
});
