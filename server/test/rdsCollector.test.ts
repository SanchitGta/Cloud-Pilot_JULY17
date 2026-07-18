import { DescribeDBInstancesCommand, RDSClient } from '@aws-sdk/client-rds';
import { CloudWatchClient, GetMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { collect } from '../src/collectors/rdsCollector.js';

const rdsMock = mockClient(RDSClient);
const cwMock = mockClient(CloudWatchClient);

const creds = {
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'secret',
  region: 'us-east-1',
};

describe('rdsCollector.collect', () => {
  beforeEach(() => {
    rdsMock.reset();
    cwMock.reset();
  });

  it('returns [] and never calls CloudWatch when there are no instances', async () => {
    rdsMock.on(DescribeDBInstancesCommand).resolves({ DBInstances: [] });

    const result = await collect(creds);

    expect(result).toEqual([]);
    expect(cwMock.calls()).toHaveLength(0);
  });

  it('batches two instances into one GetMetricData call against AWS/RDS with the db. prefix retained', async () => {
    rdsMock.on(DescribeDBInstancesCommand).resolves({
      DBInstances: [
        { DBInstanceIdentifier: 'db-1', DBInstanceClass: 'db.t3.micro' },
        { DBInstanceIdentifier: 'db-2', DBInstanceClass: 'db.r5.large' },
      ],
    });
    cwMock.on(GetMetricDataCommand).resolves({
      MetricDataResults: [
        { Id: 'cpu_0', Values: [10, 20] },
        { Id: 'cpu_1', Values: [] },
      ],
    });

    const result = await collect(creds);

    expect(cwMock.calls()).toHaveLength(1);
    const query = cwMock.calls()[0].args[0].input.MetricDataQueries[0];
    expect(query.MetricStat.Metric.Namespace).toBe('AWS/RDS');
    expect(query.MetricStat.Metric.Dimensions).toEqual([
      { Name: 'DBInstanceIdentifier', Value: 'db-1' },
    ]);
    expect(result).toEqual([
      { dbInstanceId: 'db-1', instanceType: 'db.t3.micro', avgCpu14d: 15 },
      { dbInstanceId: 'db-2', instanceType: 'db.r5.large', avgCpu14d: null },
    ]);
  });

  it('rejects when DescribeDBInstances throws', async () => {
    rdsMock.on(DescribeDBInstancesCommand).rejects(new Error('access denied'));

    await expect(collect(creds)).rejects.toThrow('access denied');
  });

  it('rejects when GetMetricData throws', async () => {
    rdsMock.on(DescribeDBInstancesCommand).resolves({
      DBInstances: [{ DBInstanceIdentifier: 'db-1', DBInstanceClass: 'db.t3.micro' }],
    });
    cwMock.on(GetMetricDataCommand).rejects(new Error('throttled'));

    await expect(collect(creds)).rejects.toThrow('throttled');
  });
});
