import { S3Client, ListBucketsCommand } from '@aws-sdk/client-s3';
import {
  CloudWatchClient,
  paginateGetMetricData,
  type MetricDataQuery,
} from '@aws-sdk/client-cloudwatch';
import type { AwsCredentials, S3BucketData } from '../types.js';

const BUCKET_CHUNK_SIZE = 250;
const DAY_MS = 24 * 60 * 60 * 1000;

function subDays(date: Date, days: number): Date {
  return new Date(date.getTime() - days * DAY_MS);
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

interface SizeInfo {
  currentSize: number;
  size30dAgo: number | null;
}

export async function collect(creds: AwsCredentials): Promise<S3BucketData[]> {
  const s3 = new S3Client({ region: creds.region, credentials: creds });
  const cw = new CloudWatchClient({ region: 'us-east-1', credentials: creds });

  const { Buckets } = await s3.send(new ListBucketsCommand({}));
  if (!Buckets || Buckets.length === 0) {
    return [];
  }

  const buckets = Buckets.map((b) => b.Name).filter((name): name is string => Boolean(name));
  const results: S3BucketData[] = [];

  const now = new Date();
  const start31d = subDays(now, 31);
  const thirtyDayCutoff = subDays(now, 29);

  for (const bucketChunk of chunk(buckets, BUCKET_CHUNK_SIZE)) {
    const sizeMap = new Map<string, SizeInfo>();
    const countMap = new Map<string, number>();
    const idMap = new Map<string, { bucket: string; metric: 'size' | 'count' }>();

    const queries: MetricDataQuery[] = [];
    bucketChunk.forEach((bucket, i) => {
      const sizeId = `size_${i}`;
      const countId = `cnt_${i}`;
      idMap.set(sizeId, { bucket, metric: 'size' });
      idMap.set(countId, { bucket, metric: 'count' });

      queries.push({
        Id: sizeId,
        MetricStat: {
          Metric: {
            Namespace: 'AWS/S3',
            MetricName: 'BucketSizeBytes',
            Dimensions: [
              { Name: 'BucketName', Value: bucket },
              { Name: 'StorageType', Value: 'StandardStorage' },
            ],
          },
          Period: 86400,
          Stat: 'Average',
        },
        ReturnData: true,
      });
      queries.push({
        Id: countId,
        MetricStat: {
          Metric: {
            Namespace: 'AWS/S3',
            MetricName: 'NumberOfObjects',
            Dimensions: [
              { Name: 'BucketName', Value: bucket },
              { Name: 'StorageType', Value: 'AllStorageTypes' },
            ],
          },
          Period: 86400,
          Stat: 'Average',
        },
        ReturnData: true,
      });
    });

    const paginator = paginateGetMetricData(
      { client: cw },
      { MetricDataQueries: queries, StartTime: start31d, EndTime: now }
    );

    for await (const page of paginator) {
      for (const result of page.MetricDataResults ?? []) {
        const info = idMap.get(result.Id ?? '');
        if (!info) continue;
        const values = result.Values ?? [];
        const timestamps = result.Timestamps ?? [];

        if (info.metric === 'size') {
          const currentSize = values.length > 0 ? values[0] : 0;
          const oldestTimestamp = timestamps[timestamps.length - 1];
          const size30dAgo =
            timestamps.length >= 2 && oldestTimestamp && oldestTimestamp <= thirtyDayCutoff
              ? values[values.length - 1]
              : null;
          sizeMap.set(info.bucket, { currentSize, size30dAgo });
        } else {
          const currentCount = values.length > 0 ? Math.round(values[0]) : 0;
          countMap.set(info.bucket, currentCount);
        }
      }
    }

    for (const bucket of bucketChunk) {
      results.push({
        bucketName: bucket,
        sizeBytes: sizeMap.get(bucket)?.currentSize ?? 0,
        objectCount: countMap.get(bucket) ?? 0,
        size30dAgoBytes: sizeMap.get(bucket)?.size30dAgo ?? null,
      });
    }
  }

  return results;
}
