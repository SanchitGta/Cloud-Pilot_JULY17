import Anthropic from '@anthropic-ai/sdk';
import type { FindingRow } from '../types.js';

// Constructed lazily on first use (see getClient) rather than at module scope:
// `new Anthropic()` throws synchronously when it cannot resolve any credentials
// (no ANTHROPIC_API_KEY, etc.). This module is imported transitively from
// index.ts, so a module-scope client would crash server startup — and the test
// suite — whenever ANTHROPIC_API_KEY is unset. Confining construction to
// getClient() turns that into a single caught, logged, per-finding error.
let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic();
  }
  return client;
}

const SYSTEM_PROMPT = `You turn a structured cloud cost-optimization finding into a short,
plain-language explanation for a non-technical stakeholder.
Always name the specific resource (its type and ID), restate the
metric that triggered the finding, restate the suggested action,
and describe the expected impact (estimated savings, or risk of
the action). 2-4 sentences. Plain prose - no markdown, no bullets,
no headers.`;

function buildPrompt(finding: FindingRow): string {
  return [
    `Resource type: ${finding.resource_type}`,
    `Resource ID: ${finding.resource_id}`,
    `Category: ${finding.category}`,
    `Severity: ${finding.severity}`,
    `Estimated monthly savings (USD): ${finding.estimated_monthly_savings}`,
    `Recommendation: ${finding.recommendation_text}`,
  ].join('\n');
}

// Isolates the external LLM call and its failure modes from orchestration.
// Throws (does not catch) on any failure — auth error, rate limit, network
// error, refusal, or an empty/missing text block. The caller
// (explanationService) is responsible for catching.
export async function generateExplanation(finding: FindingRow): Promise<string> {
  const response = await getClient().messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 400,
    system: SYSTEM_PROMPT,
    output_config: { effort: 'low' },
    messages: [{ role: 'user', content: buildPrompt(finding) }],
  });

  if (response.stop_reason === 'refusal') {
    throw new Error('Explanation generation refused');
  }

  const textBlock = response.content.find((block) => block.type === 'text');
  const text = textBlock?.type === 'text' ? textBlock.text.trim() : undefined;
  if (!text) {
    throw new Error('Explanation generation returned no text');
  }
  return text;
}
