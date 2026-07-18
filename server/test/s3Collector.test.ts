import { ListBucketsCommand, S3Client } from '@aws-sdk/client-s3';
import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { collect } from '../src/collectors/s3Collector.js';

const s3Mock = mockClient(S3Client);
const cwMock = mockClient(CloudWatchClient);

const creds = {
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'secret',
  region: 'eu-west-1',
};

const now = new Date();
const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

describe('s3Collector.collect', () => {
  beforeEach(() => {
    s3Mock.reset();
    cwMock.reset();
  });

  it('returns [] when there are no buckets', async () => {
    s3Mock.on(ListBucketsCommand).resolves({ Buckets: [] });

    const result = await collect(creds);

    expect(result).toEqual([]);
    expect(cwMock.calls()).toHaveLength(0);
  });

  it('creates the CloudWatch client in us-east-1 regardless of connection region', async () => {
    s3Mock.on(ListBucketsCommand).resolves({ Buckets: [{ Name: 'bucket-a' }] });
    cwMock.on(GetMetricDataCommand).resolves({ MetricDataResults: [] });

    await collect(creds);

    const clientRegion = await cwMock.calls()[0].thisValue.config.region();
    expect(clientRegion).toBe('us-east-1');
  });

  it('populates size30dAgoBytes when 31 days of size data is available', async () => {
    s3Mock.on(ListBucketsCommand).resolves({
      Buckets: [{ Name: 'bucket-a' }, { Name: 'bucket-b' }],
    });
    cwMock.on(GetMetricDataCommand).resolves({
      MetricDataResults: [
        { Id: 'size_0', Values: [2000, 1000], Timestamps: [now, thirtyDaysAgo] },
        { Id: 'cnt_0', Values: [42], Timestamps: [now] },
        { Id: 'size_1', Values: [500, 300], Timestamps: [now, thirtyDaysAgo] },
        { Id: 'cnt_1', Values: [7], Timestamps: [now] },
      ],
    });

    const result = await collect(creds);

    expect(result).toEqual([
      { bucketName: 'bucket-a', sizeBytes: 2000, objectCount: 42, size30dAgoBytes: 1000 },
      { bucketName: 'bucket-b', sizeBytes: 500, objectCount: 7, size30dAgoBytes: 300 },
    ]);
  });

  it('sets size30dAgoBytes to null for a bucket with only one CloudWatch datapoint', async () => {
    s3Mock.on(ListBucketsCommand).resolves({ Buckets: [{ Name: 'new-bucket' }] });
    cwMock.on(GetMetricDataCommand).resolves({
      MetricDataResults: [
        { Id: 'size_0', Values: [500], Timestamps: [now] },
        { Id: 'cnt_0', Values: [3], Timestamps: [now] },
      ],
    });

    const result = await collect(creds);

    expect(result).toEqual([
      { bucketName: 'new-bucket', sizeBytes: 500, objectCount: 3, size30dAgoBytes: null },
    ]);
  });

  it('defaults to zero size/count and null growth when there is no CloudWatch data at all', async () => {
    s3Mock.on(ListBucketsCommand).resolves({ Buckets: [{ Name: 'empty-bucket' }] });
    cwMock.on(GetMetricDataCommand).resolves({ MetricDataResults: [] });

    const result = await collect(creds);

    expect(result).toEqual([
      { bucketName: 'empty-bucket', sizeBytes: 0, objectCount: 0, size30dAgoBytes: null },
    ]);
  });

  it('rejects when ListBuckets throws', async () => {
    s3Mock.on(ListBucketsCommand).rejects(new Error('access denied'));

    await expect(collect(creds)).rejects.toThrow('access denied');
  });

  it('splits 251 buckets into two GetMetricData calls (250 + 1 bucket)', async () => {
    const buckets = Array.from({ length: 251 }, (_, i) => ({ Name: `bucket-${i}` }));
    s3Mock.on(ListBucketsCommand).resolves({ Buckets: buckets });
    cwMock.on(GetMetricDataCommand).resolves({ MetricDataResults: [] });

    await collect(creds);

    expect(cwMock.calls()).toHaveLength(2);
    expect(cwMock.calls()[0].args[0].input.MetricDataQueries).toHaveLength(500);
    expect(cwMock.calls()[1].args[0].input.MetricDataQueries).toHaveLength(2);
  });
});
