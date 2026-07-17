import { GetCallerIdentityCommand, STSClient } from '@aws-sdk/client-sts';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import { validateCredentials } from '../src/services/awsValidation.js';

const stsMock = mockClient(STSClient);

const validInput = {
  accessKeyId: 'AKIAEXAMPLE',
  secretAccessKey: 'secret',
  region: 'us-east-1',
};

describe('validateCredentials', () => {
  beforeEach(() => {
    stsMock.reset();
  });

  it('returns ok with account id and arn on success', async () => {
    stsMock.on(GetCallerIdentityCommand).resolves({
      Account: '123456789012',
      Arn: 'arn:aws:iam::123456789012:user/test',
    });

    const result = await validateCredentials(validInput);

    expect(result).toEqual({ ok: true, accountId: '123456789012', arn: 'arn:aws:iam::123456789012:user/test' });
  });

  it('maps InvalidClientTokenId to an access-key-specific message', async () => {
    const err = new Error('The security token included in the request is invalid');
    err.name = 'InvalidClientTokenId';
    stsMock.on(GetCallerIdentityCommand).rejects(err);

    const result = await validateCredentials(validInput);

    expect(result).toEqual({
      ok: false,
      message: 'The Access Key ID is invalid or does not exist.',
    });
  });

  it('maps SignatureDoesNotMatch to a secret-key-specific message', async () => {
    const err = new Error('The request signature does not match');
    err.name = 'SignatureDoesNotMatch';
    stsMock.on(GetCallerIdentityCommand).rejects(err);

    const result = await validateCredentials(validInput);

    expect(result).toEqual({
      ok: false,
      message: 'The Secret Access Key is incorrect.',
    });
  });

  it('maps AccessDenied to a permission-specific message', async () => {
    const err = new Error('User is not authorized to perform sts:GetCallerIdentity');
    err.name = 'AccessDenied';
    stsMock.on(GetCallerIdentityCommand).rejects(err);

    const result = await validateCredentials(validInput);

    expect(result).toEqual({
      ok: false,
      message:
        'These credentials are valid but are denied permission to call sts:GetCallerIdentity. Grant that permission and retry.',
    });
  });

  it('rejects a malformed region without calling STS at all', async () => {
    const result = await validateCredentials({ ...validInput, region: 'not-a-region' });

    expect(result).toEqual({
      ok: false,
      message: '"not-a-region" is not a recognized AWS region.',
    });
    expect(stsMock.calls()).toHaveLength(0);
  });
});
