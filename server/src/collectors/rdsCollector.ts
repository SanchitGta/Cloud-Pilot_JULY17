import { RDSClient, paginateDescribeDBInstances } from '@aws-sdk/client-rds';
import {
  CloudWatchClient,
  paginateGetMetricData,
  type MetricDataQuery,
} from '@aws-sdk/client-cloudwatch';
import type { AwsCredentials, RdsInstanceData } from '../types.js';

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const METRIC_QUERY_CHUNK_SIZE = 500;

interface RdsInstance {
  dbInstanceId: string;
  instanceType: string;
}

function mean(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function chunk<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

async function buildCpuMap(
  cw: CloudWatchClient,
  instances: RdsInstance[]
): Promise<Map<string, number | null>> {
  const avgCpuMap = new Map<string, number | null>();
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - FOURTEEN_DAYS_MS);

  for (const instChunk of chunk(instances, METRIC_QUERY_CHUNK_SIZE)) {
    const idMap = new Map<string, string>();
    const queries: MetricDataQuery[] = instChunk.map((inst, i) => {
      const cwId = `cpu_${i}`;
      idMap.set(cwId, inst.dbInstanceId);
      return {
        Id: cwId,
        MetricStat: {
          Metric: {
            Namespace: 'AWS/RDS',
            MetricName: 'CPUUtilization',
            Dimensions: [{ Name: 'DBInstanceIdentifier', Value: inst.dbInstanceId }],
          },
          Period: 86400,
          Stat: 'Average',
        },
        ReturnData: true,
      };
    });

    const paginator = paginateGetMetricData(
      { client: cw },
      { MetricDataQueries: queries, StartTime: startTime, EndTime: endTime }
    );

    for await (const page of paginator) {
      for (const result of page.MetricDataResults ?? []) {
        const dbInstanceId = idMap.get(result.Id ?? '');
        if (!dbInstanceId) continue;
        const values = result.Values ?? [];
        avgCpuMap.set(dbInstanceId, values.length === 0 ? null : mean(values));
      }
    }
  }

  return avgCpuMap;
}

export async function collect(creds: AwsCredentials): Promise<RdsInstanceData[]> {
  const rds = new RDSClient({ region: creds.region, credentials: creds });
  const cw = new CloudWatchClient({ region: creds.region, credentials: creds });

  const instances: RdsInstance[] = [];
  const paginator = paginateDescribeDBInstances({ client: rds }, {});
  for await (const page of paginator) {
    for (const inst of page.DBInstances ?? []) {
      if (!inst.DBInstanceIdentifier || !inst.DBInstanceClass) continue;
      instances.push({
        dbInstanceId: inst.DBInstanceIdentifier,
        instanceType: inst.DBInstanceClass,
      });
    }
  }

  if (instances.length === 0) {
    return [];
  }

  const avgCpuMap = await buildCpuMap(cw, instances);

  return instances.map((inst) => ({
    dbInstanceId: inst.dbInstanceId,
    instanceType: inst.instanceType,
    avgCpu14d: avgCpuMap.get(inst.dbInstanceId) ?? null,
  }));
}
