import { describe, expect, it } from 'vitest';
import {
  getEc2MonthlyPrice,
  getRdsMonthlyPrice,
  getNextSmallerRdsClass,
  getEbsMonthlyPrice,
  getS3StandardMonthlyPrice,
  getS3StandardIaMonthlyPrice,
  regionMultiplier,
  roundCurrency,
  HOURS_PER_MONTH,
  EBS_GB_MONTH_USD,
  S3_STANDARD_GB_MONTH_USD,
  S3_STANDARD_IA_GB_MONTH_USD,
} from '../src/pricing/awsPricing.js';

describe('awsPricing', () => {
  it('prices a known EC2 instance type at us-east-1 baseline', () => {
    expect(getEc2MonthlyPrice('t3.micro', 'us-east-1')).toBe(roundCurrency(0.0104 * HOURS_PER_MONTH));
  });

  it('applies the region multiplier to EC2 pricing', () => {
    expect(getEc2MonthlyPrice('t3.micro', 'ap-northeast-1')).toBe(
      roundCurrency(0.0104 * HOURS_PER_MONTH * 1.2)
    );
  });

  it('returns null for an unpriced EC2 instance type', () => {
    expect(getEc2MonthlyPrice('made.up.type', 'us-east-1')).toBeNull();
  });

  it('prices a known RDS instance type at us-east-1 baseline', () => {
    expect(getRdsMonthlyPrice('db.t3.micro', 'us-east-1')).toBe(roundCurrency(0.017 * HOURS_PER_MONTH));
  });

  it('applies the region multiplier to RDS pricing', () => {
    expect(getRdsMonthlyPrice('db.t3.micro', 'ap-northeast-1')).toBe(
      roundCurrency(0.017 * HOURS_PER_MONTH * 1.2)
    );
  });

  it('returns null for an unpriced RDS instance type', () => {
    expect(getRdsMonthlyPrice('db.made.up', 'us-east-1')).toBeNull();
  });

  it('finds the next-smaller RDS class within the same family', () => {
    expect(getNextSmallerRdsClass('db.m5.xlarge')).toBe('db.m5.large');
  });

  it('computes the next-smaller class as pure ladder arithmetic even if unreal', () => {
    expect(getNextSmallerRdsClass('db.t3.micro')).toBe('db.t3.nano');
  });

  it('returns null when already at the floor of the ladder', () => {
    expect(getNextSmallerRdsClass('db.t4g.nano')).toBeNull();
  });

  it('returns null when the size is not on the ladder', () => {
    expect(getNextSmallerRdsClass('db.unknownfamily.bogus')).toBeNull();
  });

  it('prices EBS storage and never returns null', () => {
    expect(getEbsMonthlyPrice(100, 'us-east-1')).toBe(roundCurrency(100 * EBS_GB_MONTH_USD));
  });

  it('prices S3 Standard and Standard-IA storage for a known byte count', () => {
    const sizeBytes = 100 * 1024 ** 3;
    expect(getS3StandardMonthlyPrice(sizeBytes, 'us-east-1')).toBe(
      roundCurrency(100 * S3_STANDARD_GB_MONTH_USD)
    );
    expect(getS3StandardIaMonthlyPrice(sizeBytes, 'us-east-1')).toBe(
      roundCurrency(100 * S3_STANDARD_IA_GB_MONTH_USD)
    );
  });

  it('falls back to a 1.0 multiplier for an unknown region', () => {
    expect(regionMultiplier('unknown-region')).toBe(1.0);
  });
});
