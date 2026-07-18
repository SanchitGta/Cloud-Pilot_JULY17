import { DescribeInstancesCommand, EC2Client } from '@aws-sdk/client-ec2';
import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { collect } from '../src/collectors/ec2Collector.js';

const ec2Mock = mockClient(EC2Client);
const cwMock = mockClient(CloudWatchClient);

const creds = {
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'secret',
  region: 'us-east-1',
};

describe('ec2Collector.collect', () => {
  beforeEach(() => {
    ec2Mock.reset();
    cwMock.reset();
  });

  it('returns [] and never calls CloudWatch when there are no instances', async () => {
    ec2Mock.on(DescribeInstancesCommand).resolves({ Reservations: [] });

    const result = await collect(creds);

    expect(result).toEqual([]);
    expect(cwMock.calls()).toHaveLength(0);
  });

  it('batches two instances into one GetMetricData call and averages values', async () => {
    ec2Mock.on(DescribeInstancesCommand).resolves({
      Reservations: [
        {
          Instances: [
            { InstanceId: 'i-1', InstanceType: 't3.micro', State: { Name: 'running' } },
            { InstanceId: 'i-2', InstanceType: 't3.small', State: { Name: 'running' } },
          ],
        },
      ],
    });
    cwMock.on(GetMetricDataCommand).resolves({
      MetricDataResults: [
        { Id: 'cpu_0', Values: [10, 20, 30] },
        { Id: 'cpu_1', Values: [5, 15] },
      ],
    });

    const result = await collect(creds);

    expect(cwMock.calls()).toHaveLength(1);
    expect(cwMock.calls()[0].args[0].input.MetricDataQueries).toHaveLength(2);
    expect(result).toEqual([
      { instanceId: 'i-1', instanceType: 't3.micro', state: 'running', avgCpu14d: 20 },
      { instanceId: 'i-2', instanceType: 't3.small', state: 'running', avgCpu14d: 10 },
    ]);
  });

  it('sets avgCpu14d to null when CloudWatch returns zero datapoints', async () => {
    ec2Mock.on(DescribeInstancesCommand).resolves({
      Reservations: [
        {
          Instances: [{ InstanceId: 'i-1', InstanceType: 't3.micro', State: { Name: 'stopped' } }],
        },
      ],
    });
    cwMock.on(GetMetricDataCommand).resolves({
      MetricDataResults: [{ Id: 'cpu_0', Values: [] }],
    });

    const result = await collect(creds);

    expect(result).toEqual([
      { instanceId: 'i-1', instanceType: 't3.micro', state: 'stopped', avgCpu14d: null },
    ]);
  });

  it('rejects when DescribeInstances throws AccessDeniedException', async () => {
    const err = new Error('User is not authorized to perform: ec2:DescribeInstances');
    err.name = 'AccessDeniedException';
    ec2Mock.on(DescribeInstancesCommand).rejects(err);

    await expect(collect(creds)).rejects.toThrow(
      'User is not authorized to perform: ec2:DescribeInstances'
    );
  });

  it('rejects when GetMetricData throws', async () => {
    ec2Mock.on(DescribeInstancesCommand).resolves({
      Reservations: [
        { Instances: [{ InstanceId: 'i-1', InstanceType: 't3.micro', State: { Name: 'running' } }] },
      ],
    });
    cwMock.on(GetMetricDataCommand).rejects(new Error('throttled'));

    await expect(collect(creds)).rejects.toThrow('throttled');
  });

  it('splits 501 instances into two GetMetricData calls (500 + 1)', async () => {
    const instances = Array.from({ length: 501 }, (_, i) => ({
      InstanceId: `i-${i}`,
      InstanceType: 't3.micro',
      State: { Name: 'running' },
    }));
    ec2Mock.on(DescribeInstancesCommand).resolves({
      Reservations: [{ Instances: instances }],
    });
    cwMock.on(GetMetricDataCommand).resolves({ MetricDataResults: [] });

    await collect(creds);

    expect(cwMock.calls()).toHaveLength(2);
    expect(cwMock.calls()[0].args[0].input.MetricDataQueries).toHaveLength(500);
    expect(cwMock.calls()[1].args[0].input.MetricDataQueries).toHaveLength(1);
  });
});
