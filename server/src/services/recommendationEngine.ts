import { getDb } from '../db/index.js';
import * as scanResourcesRepo from '../repos/scanResourcesRepo.js';
import * as findingsRepo from '../repos/findingsRepo.js';
import * as pricing from '../pricing/awsPricing.js';
import type { FindingData, FindingSeverity } from '../types.js';

const FIFTY_GB_BYTES = 50 * 1024 ** 3;

function severityFor(monthlySavings: number): FindingSeverity {
  if (monthlySavings >= 100) return 'HIGH';
  if (monthlySavings >= 20) return 'MEDIUM';
  return 'LOW';
}

export function generateFindings(scanId: number, region: string): void {
  const findings: FindingData[] = [];

  // --- Idle EC2 ---
  for (const inst of scanResourcesRepo.getEc2Instances(scanId)) {
    const avgCpu = inst.avg_cpu_14d;
    if (inst.state !== 'running') continue;
    if (avgCpu === null || avgCpu >= 5) continue; // null = unknown, not idle
    const monthly = pricing.getEc2MonthlyPrice(inst.instance_type, region);
    if (monthly === null) continue; // unpriced instance type — skip
    findings.push({
      resourceType: 'EC2',
      resourceId: inst.instance_id,
      category: 'IDLE_EC2',
      severity: severityFor(monthly),
      estimatedMonthlySavings: monthly,
      recommendationText:
        `Instance ${inst.instance_id} (${inst.instance_type}) averaged ` +
        `${avgCpu.toFixed(1)}% CPU over the last 14 days. Review for downsizing or termination.`,
    });
  }

  // --- Unattached EBS ---
  for (const vol of scanResourcesRepo.getEbsVolumes(scanId)) {
    if (vol.attachment_status !== 'unattached') continue;
    const monthly = pricing.getEbsMonthlyPrice(vol.size_gb, region);
    findings.push({
      resourceType: 'EBS',
      resourceId: vol.volume_id,
      category: 'UNATTACHED_EBS',
      severity: severityFor(monthly),
      estimatedMonthlySavings: monthly,
      recommendationText:
        `Volume ${vol.volume_id} (${vol.size_gb} GB) has no attached instance. ` +
        `Consider deleting the unused volume.`,
    });
  }

  // --- Underutilized RDS ---
  for (const db of scanResourcesRepo.getRdsInstances(scanId)) {
    const avgCpu = db.avg_cpu_14d;
    if (avgCpu === null || avgCpu >= 10) continue;
    const currentMonthly = pricing.getRdsMonthlyPrice(db.instance_type, region);
    if (currentMonthly === null) continue;
    const nextClass = pricing.getNextSmallerRdsClass(db.instance_type);
    if (nextClass === null) continue; // already smallest in family
    const nextMonthly = pricing.getRdsMonthlyPrice(nextClass, region);
    if (nextMonthly === null) continue; // next class unpriced
    const savings = pricing.roundCurrency(currentMonthly - nextMonthly);
    if (savings <= 0) continue; // guard against non-monotonic table entries
    findings.push({
      resourceType: 'RDS',
      resourceId: db.db_instance_id,
      category: 'UNDERUTILIZED_RDS',
      severity: severityFor(savings),
      estimatedMonthlySavings: savings,
      recommendationText:
        `Instance ${db.db_instance_id} (${db.instance_type}) averaged ` +
        `${avgCpu.toFixed(1)}% CPU over the last 14 days. Consider downsizing to ${nextClass}.`,
    });
  }

  // --- Low-activity S3 ---
  for (const bucket of scanResourcesRepo.getS3Buckets(scanId)) {
    if (bucket.size_bytes <= FIFTY_GB_BYTES) continue;
    const baseline = bucket.size_30d_ago_bytes;
    if (baseline === null || baseline === 0) continue; // no usable 30-day baseline
    const growthPct = ((bucket.size_bytes - baseline) / baseline) * 100;
    if (growthPct <= 10) continue;
    const standardMonthly = pricing.getS3StandardMonthlyPrice(bucket.size_bytes, region);
    const iaMonthly = pricing.getS3StandardIaMonthlyPrice(bucket.size_bytes, region);
    const savings = pricing.roundCurrency(standardMonthly - iaMonthly);
    if (savings <= 0) continue;
    const sizeGb = bucket.size_bytes / 1024 ** 3;
    findings.push({
      resourceType: 'S3',
      resourceId: bucket.bucket_name,
      category: 'LOW_ACTIVITY_S3',
      severity: severityFor(savings),
      estimatedMonthlySavings: savings,
      recommendationText:
        `Bucket ${bucket.bucket_name} is ${sizeGb.toFixed(1)} GB and grew ` +
        `${growthPct.toFixed(1)}% over the last 30 days with low apparent activity. ` +
        `Review retention and lifecycle policies.`,
    });
  }

  const dbHandle = getDb();
  dbHandle.transaction(() => {
    findingsRepo.insertFindings(dbHandle, scanId, findings);
  })();
}
