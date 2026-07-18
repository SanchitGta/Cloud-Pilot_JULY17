import * as findingsRepo from '../repos/findingsRepo.js';
import * as explanationClient from './explanationClient.js';

// Orchestrates per-scan explanation generation without ever throwing or
// blocking. Loads the scan's findings, calls the LLM once per finding
// (sequentially — pilot scans produce a handful of findings, and this whole
// step is non-blocking background work), backfills successes via
// findingsRepo.updateExplanation, and catches/logs per-finding failures so one
// bad call doesn't stop the rest. A finding that never gets an explanation just
// keeps explanation = NULL.
export async function generateExplanations(scanId: number): Promise<void> {
  const findings = findingsRepo.getFindings(scanId);
  for (const finding of findings) {
    try {
      const explanation = await explanationClient.generateExplanation(finding);
      findingsRepo.updateExplanation(finding.id, explanation);
    } catch (err) {
      console.error(`Explanation generation failed for finding ${finding.id}:`, err);
      // explanation stays NULL for this finding; continue to the next one
    }
  }
}
