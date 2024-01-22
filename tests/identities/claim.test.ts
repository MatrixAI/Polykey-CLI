import type {
  IdentityId,
  ProviderId,
  ProviderIdentityClaimId,
} from 'polykey/dist/identities/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import { sysexits } from 'polykey/dist/utils';
import * as identitiesUtils from 'polykey/dist/identities/utils';
import * as keysUtils from 'polykey/dist/keys/utils';
import TestProvider from '../TestProvider';
import * as testUtils from '../utils';

// @ts-ignore: stub out method
identitiesUtils.browser = () => {};

describe('claim', () => {
  const logger = new Logger('claim test', LogLevel.WARN, [new StreamHandler()]);
  const password = 'helloworld';
  const testToken = {
    providerId: 'test-provider' as ProviderId,
    identityId: 'test_user' as IdentityId,
  };
  let dataDir: string;
  let nodePath: string;
  let pkAgent: PolykeyAgent;
  let testProvider: TestProvider;
  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'polykey-test-'),
    );
    nodePath = path.join(dataDir, 'polykey');
    // Cannot use global shared agent since we need to register a provider
    pkAgent = await PolykeyAgent.createPolykeyAgent({
      password,
      options: {
        nodePath,
        agentServiceHost: '127.0.0.1',
        clientServiceHost: '127.0.0.1',
        keys: {
          passwordOpsLimit: keysUtils.passwordOpsLimits.min,
          passwordMemLimit: keysUtils.passwordMemLimits.min,
          strictMemoryLock: false,
        },
      },
      logger,
    });
    testProvider = new TestProvider();
    pkAgent.identitiesManager.registerProvider(testProvider);
  });
  afterEach(async () => {
    await pkAgent.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });
  test('claims an identity', async () => {
    // Need an authenticated identity
    await testUtils.pkStdio(
      [
        'identities',
        'authenticate',
        testToken.providerId,
        testToken.identityId,
      ],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    );
    // Claim identity
    const { exitCode, stdout } = await testUtils.pkStdio(
      [
        'identities',
        'claim',
        `${testToken.providerId}:${testToken.identityId}`,
        '--format',
        'json',
      ],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    );
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual(['Claim Id: 0', 'Url: test.com']);
    // Check for claim on the provider
    const claim = await testProvider.getClaim(
      testToken.identityId,
      '0' as ProviderIdentityClaimId,
    );
    expect(claim).toBeDefined();
    expect(claim!.id).toBe('0');
    // Expect(claim!.payload.data.type).toBe('identity');
  });
  test('cannot claim unauthenticated identities', async () => {
    const { exitCode } = await testUtils.pkStdio(
      [
        'identities',
        'claim',
        `${testToken.providerId}:${testToken.identityId}`,
      ],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    );
    expect(exitCode).toBe(sysexits.NOPERM);
  });
  test('should fail on invalid inputs', async () => {
    let exitCode: number;
    // Invalid provider
    ({ exitCode } = await testUtils.pkStdio(
      ['identities', 'claim', `:${testToken.identityId}`],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    ));
    expect(exitCode).toBe(sysexits.USAGE);
    // Invalid identity
    ({ exitCode } = await testUtils.pkStdio(
      ['identities', 'claim', `${testToken.providerId}:`],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    ));
    expect(exitCode).toBe(sysexits.USAGE);
  });
});
