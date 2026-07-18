import { EC2Client, paginateDescribeVolumes } from '@aws-sdk/client-ec2';
import type { AwsCredentials, EbsVolumeData } from '../types.js';

const ATTACHED_STATES = new Set(['attached', 'attaching', 'busy']);

export async function collect(creds: AwsCredentials): Promise<EbsVolumeData[]> {
  const ec2 = new EC2Client({ region: creds.region, credentials: creds });

  const volumes: EbsVolumeData[] = [];
  const paginator = paginateDescribeVolumes({ client: ec2 }, {});
  for await (const page of paginator) {
    for (const vol of page.Volumes ?? []) {
      if (!vol.VolumeId || vol.Size === undefined) continue;
      const attached = vol.Attachments?.some(
        (a) => a.State !== undefined && ATTACHED_STATES.has(a.State)
      ) ?? false;
      volumes.push({
        volumeId: vol.VolumeId,
        sizeGb: vol.Size,
        attachmentStatus: attached ? 'attached' : 'unattached',
      });
    }
  }

  return volumes;
}
