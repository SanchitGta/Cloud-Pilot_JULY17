import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { isValidRegion } from '../constants/awsRegions.js';

export interface ValidateCredentialsInput {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
}

export type ValidateCredentialsResult =
  | { ok: true; accountId: string; arn: string }
  | { ok: false; message: string };

const NETWORK_ERROR_CODES = new Set(['ENOTFOUND', 'ETIMEDOUT', 'ECONNREFUSED']);

export async function validateCredentials(
  input: ValidateCredentialsInput
): Promise<ValidateCredentialsResult> {
  if (!isValidRegion(input.region)) {
    return { ok: false, message: `"${input.region}" is not a recognized AWS region.` };
  }

  const client = new STSClient({
    region: input.region,
    credentials: {
      accessKeyId: input.accessKeyId,
      secretAccessKey: input.secretAccessKey,
    },
  });

  try {
    const result = await client.send(new GetCallerIdentityCommand({}));
    return { ok: true, accountId: result.Account ?? '', arn: result.Arn ?? '' };
  } catch (err: any) {
    const code = err?.name;

    switch (code) {
      case 'InvalidClientTokenId':
      case 'UnrecognizedClientException':
        return { ok: false, message: 'The Access Key ID is invalid or does not exist.' };
      case 'SignatureDoesNotMatch':
        return { ok: false, message: 'The Secret Access Key is incorrect.' };
      case 'AccessDenied':
        return {
          ok: false,
          message:
            'These credentials are valid but are denied permission to call sts:GetCallerIdentity. Grant that permission and retry.',
        };
      default:
        if (NETWORK_ERROR_CODES.has(err?.code)) {
          return {
            ok: false,
            message: 'Could not reach AWS. Check network connectivity and try again.',
          };
        }
        return { ok: false, message: `AWS rejected the request: ${err?.message ?? 'unknown error'}` };
    }
  }
}
