export const HOURS_PER_MONTH = 730; // AWS's own standard hourly->monthly convention

// On-demand hourly USD, us-east-1, Linux. Curated set covering common general-purpose,
// compute-optimized, and memory-optimized families for a pilot MVP account. Extend with
// the same family/size pattern as new types are seen in practice (see Risks).
export const EC2_HOURLY_USD: Record<string, number> = {
  't2.nano': 0.0058, 't2.micro': 0.0116, 't2.small': 0.023, 't2.medium': 0.0464,
  't2.large': 0.0928, 't2.xlarge': 0.1856, 't2.2xlarge': 0.3712,
  't3.nano': 0.0052, 't3.micro': 0.0104, 't3.small': 0.0208, 't3.medium': 0.0416,
  't3.large': 0.0832, 't3.xlarge': 0.1664, 't3.2xlarge': 0.3328,
  't3a.nano': 0.0047, 't3a.micro': 0.0094, 't3a.small': 0.0188, 't3a.medium': 0.0376,
  't3a.large': 0.0752, 't3a.xlarge': 0.1504, 't3a.2xlarge': 0.3008,
  't4g.nano': 0.0042, 't4g.micro': 0.0084, 't4g.small': 0.0168, 't4g.medium': 0.0336,
  't4g.large': 0.0672, 't4g.xlarge': 0.1344, 't4g.2xlarge': 0.2688,
  'm5.large': 0.096, 'm5.xlarge': 0.192, 'm5.2xlarge': 0.384, 'm5.4xlarge': 0.768, 'm5.8xlarge': 1.536,
  'm6i.large': 0.096, 'm6i.xlarge': 0.192, 'm6i.2xlarge': 0.384, 'm6i.4xlarge': 0.768,
  'c5.large': 0.085, 'c5.xlarge': 0.17, 'c5.2xlarge': 0.34, 'c5.4xlarge': 0.68,
  'c6i.large': 0.085, 'c6i.xlarge': 0.17, 'c6i.2xlarge': 0.34,
  'r5.large': 0.126, 'r5.xlarge': 0.252, 'r5.2xlarge': 0.504, 'r5.4xlarge': 1.008,
  'r6i.large': 0.126, 'r6i.xlarge': 0.252, 'r6i.2xlarge': 0.504,
};

// On-demand hourly USD, us-east-1, MySQL/PostgreSQL Community, Single-AZ. RDS pricing is
// engine-dependent and story #8's schema does not capture engine — this table assumes the
// open-source-engine baseline uniformly (see Risks).
export const RDS_HOURLY_USD: Record<string, number> = {
  'db.t3.micro': 0.017, 'db.t3.small': 0.034, 'db.t3.medium': 0.068,
  'db.t3.large': 0.136, 'db.t3.xlarge': 0.272,
  'db.t4g.micro': 0.016, 'db.t4g.small': 0.032, 'db.t4g.medium': 0.065, 'db.t4g.large': 0.13,
  'db.m5.large': 0.171, 'db.m5.xlarge': 0.342, 'db.m5.2xlarge': 0.684, 'db.m5.4xlarge': 1.368,
  'db.m6i.large': 0.173, 'db.m6i.xlarge': 0.346, 'db.m6i.2xlarge': 0.692,
  'db.r5.large': 0.24, 'db.r5.xlarge': 0.48, 'db.r5.2xlarge': 0.96,
  'db.r6i.large': 0.242, 'db.r6i.xlarge': 0.484,
};

// gp3 rate, us-east-1. story #8's schema stores no EBS volume type, so this is applied
// uniformly to every unattached volume regardless of its real type (see Risks).
export const EBS_GB_MONTH_USD = 0.08;

export const S3_STANDARD_GB_MONTH_USD = 0.023;   // us-east-1, first 50TB tier
export const S3_STANDARD_IA_GB_MONTH_USD = 0.0125; // us-east-1

// Directional regional premium vs. us-east-1, applied to every $/hr and $/GB rate above.
// Approximation, not sourced from a live pricing feed — see Risks.
export const REGION_PRICE_MULTIPLIER: Record<string, number> = {
  'us-east-1': 1.0, 'us-east-2': 1.0, 'us-west-1': 1.1, 'us-west-2': 1.0,
  'eu-west-1': 1.06, 'eu-west-2': 1.1, 'eu-west-3': 1.11, 'eu-central-1': 1.14,
  'eu-north-1': 1.05, 'ap-southeast-1': 1.15, 'ap-southeast-2': 1.17,
  'ap-northeast-1': 1.2, 'ap-northeast-2': 1.06, 'ap-south-1': 1.02,
  'sa-east-1': 1.4, 'ca-central-1': 1.05,
};

// Ordered small -> large. Used to find "the next-smaller instance class in the same family".
export const RDS_SIZE_LADDER = [
  'nano', 'micro', 'small', 'medium', 'large',
  'xlarge', '2xlarge', '4xlarge', '8xlarge', '12xlarge', '16xlarge', '24xlarge',
];

export function regionMultiplier(region: string): number {
  return REGION_PRICE_MULTIPLIER[region] ?? 1.0;
}

export function roundCurrency(n: number): number {
  return Math.round(n * 100) / 100;
}

export function getEc2MonthlyPrice(instanceType: string, region: string): number | null {
  const hourly = EC2_HOURLY_USD[instanceType];
  if (hourly === undefined) {
    return null;
  }
  return roundCurrency(hourly * HOURS_PER_MONTH * regionMultiplier(region));
}

export function getRdsMonthlyPrice(instanceType: string, region: string): number | null {
  const hourly = RDS_HOURLY_USD[instanceType];
  if (hourly === undefined) {
    return null;
  }
  return roundCurrency(hourly * HOURS_PER_MONTH * regionMultiplier(region));
}

export function getNextSmallerRdsClass(instanceType: string): string | null {
  const parts = instanceType.split('.');
  if (parts.length !== 3) {
    return null;
  }
  const [prefix, family, size] = parts;
  const idx = RDS_SIZE_LADDER.indexOf(size);
  if (idx <= 0) {
    return null;
  }
  return `${prefix}.${family}.${RDS_SIZE_LADDER[idx - 1]}`;
}

export function getEbsMonthlyPrice(sizeGb: number, region: string): number {
  return roundCurrency(sizeGb * EBS_GB_MONTH_USD * regionMultiplier(region));
}

export function getS3StandardMonthlyPrice(sizeBytes: number, region: string): number {
  const gb = sizeBytes / 1024 ** 3;
  return roundCurrency(gb * S3_STANDARD_GB_MONTH_USD * regionMultiplier(region));
}

export function getS3StandardIaMonthlyPrice(sizeBytes: number, region: string): number {
  const gb = sizeBytes / 1024 ** 3;
  return roundCurrency(gb * S3_STANDARD_IA_GB_MONTH_USD * regionMultiplier(region));
}
