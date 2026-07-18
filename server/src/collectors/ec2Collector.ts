import {
  EC2Client,
  paginateDescribeInstances,
} from '@aws-sdk/client-ec2';
import {
  CloudWatchClient,
  paginateGetMetricData,
  type MetricDataQuery,
} from '@aws-sdk/client-cloudwatch';
import type { AwsCredentials, Ec2InstanceData } from '../types.js';

const FOURTEEN_DAYS_MS = 14 * 24 * 60 * 60 * 1000;
const METRIC_QUERY_CHUNK_SIZE = 500;

interface Ec2Instance {
  instanceId: string;
  instanceType: string;
  state: string;
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
  instances: Ec2Instance[]
): Promise<Map<string, number | null>> {
  const avgCpuMap = new Map<string, number | null>();
  const endTime = new Date();
  const startTime = new Date(endTime.getTime() - FOURTEEN_DAYS_MS);

  for (const instChunk of chunk(instances, METRIC_QUERY_CHUNK_SIZE)) {
    const idMap = new Map<string, string>();
    const queries: MetricDataQuery[] = instChunk.map((inst, i) => {
      const cwId = `cpu_${i}`;
      idMap.set(cwId, inst.instanceId);
      return {
        Id: cwId,
        MetricStat: {
          Metric: {
            Namespace: 'AWS/EC2',
            MetricName: 'CPUUtilization',
            Dimensions: [{ Name: 'InstanceId', Value: inst.instanceId }],
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
        const instanceId = idMap.get(result.Id ?? '');
        if (!instanceId) continue;
        const values = result.Values ?? [];
        avgCpuMap.set(instanceId, values.length === 0 ? null : mean(values));
      }
    }
  }

  return avgCpuMap;
}

export async function collect(creds: AwsCredentials): Promise<Ec2InstanceData[]> {
  const ec2 = new EC2Client({ region: creds.region, credentials: creds });
  const cw = new CloudWatchClient({ region: creds.region, credentials: creds });

  const instances: Ec2Instance[] = [];
  const paginator = paginateDescribeInstances({ client: ec2 }, {});
  for await (const page of paginator) {
    for (const reservation of page.Reservations ?? []) {
      for (const inst of reservation.Instances ?? []) {
        if (!inst.InstanceId || !inst.InstanceType || !inst.State?.Name) continue;
        instances.push({
          instanceId: inst.InstanceId,
          instanceType: inst.InstanceType,
          state: inst.State.Name,
        });
      }
    }
  }

  if (instances.length === 0) {
    return [];
  }

  const avgCpuMap = await buildCpuMap(cw, instances);

  return instances.map((inst) => ({
    instanceId: inst.instanceId,
    instanceType: inst.instanceType,
    state: inst.state,
    avgCpu14d: avgCpuMap.get(inst.instanceId) ?? null,
  }));
}
