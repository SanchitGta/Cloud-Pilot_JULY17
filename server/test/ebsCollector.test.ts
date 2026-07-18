import { DescribeVolumesCommand, EC2Client } from '@aws-sdk/client-ec2';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { collect } from '../src/collectors/ebsCollector.js';

const ec2Mock = mockClient(EC2Client);

const creds = {
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'secret',
  region: 'us-east-1',
};

describe('ebsCollector.collect', () => {
  beforeEach(() => {
    ec2Mock.reset();
  });

  it('returns [] when there are no volumes', async () => {
    ec2Mock.on(DescribeVolumesCommand).resolves({ Volumes: [] });

    const result = await collect(creds);

    expect(result).toEqual([]);
  });

  it('reports attached and unattached volumes correctly', async () => {
    ec2Mock.on(DescribeVolumesCommand).resolves({
      Volumes: [
        { VolumeId: 'vol-1', Size: 100, Attachments: [{ State: 'attached' }] },
        { VolumeId: 'vol-2', Size: 50, Attachments: [] },
        { VolumeId: 'vol-3', Size: 20 },
      ],
    });

    const result = await collect(creds);

    expect(result).toEqual([
      { volumeId: 'vol-1', sizeGb: 100, attachmentStatus: 'attached' },
      { volumeId: 'vol-2', sizeGb: 50, attachmentStatus: 'unattached' },
      { volumeId: 'vol-3', sizeGb: 20, attachmentStatus: 'unattached' },
    ]);
  });

  it('treats a volume in the attaching state as attached', async () => {
    ec2Mock.on(DescribeVolumesCommand).resolves({
      Volumes: [{ VolumeId: 'vol-1', Size: 100, Attachments: [{ State: 'attaching' }] }],
    });

    const result = await collect(creds);

    expect(result).toEqual([{ volumeId: 'vol-1', sizeGb: 100, attachmentStatus: 'attached' }]);
  });

  it('treats a volume in the detaching state as unattached', async () => {
    ec2Mock.on(DescribeVolumesCommand).resolves({
      Volumes: [{ VolumeId: 'vol-1', Size: 100, Attachments: [{ State: 'detaching' }] }],
    });

    const result = await collect(creds);

    expect(result).toEqual([{ volumeId: 'vol-1', sizeGb: 100, attachmentStatus: 'unattached' }]);
  });

  it('rejects when DescribeVolumes throws', async () => {
    ec2Mock.on(DescribeVolumesCommand).rejects(new Error('boom'));

    await expect(collect(creds)).rejects.toThrow('boom');
  });
});
