import type { IdentityId, ProviderId } from 'polykey/dist/identities/types';
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

describe('authenticate/authenticated', () => {
  const logger = new Logger('authenticate/authenticated test', LogLevel.WARN, [
    new StreamHandler(),
  ]);
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
        clientServiceHost: '127.0.0.1',
        agentServiceHost: '127.0.0.1',
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
  test('authenticates identity with a provider and gets authenticated identity', async () => {
    // Can't test with target command due to mocking
    let exitCode, stdout;
    // Authenticate an identity
    ({ exitCode, stdout } = await testUtils.pkStdio(
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
    ));
    expect(exitCode).toBe(0);
    expect(stdout).toContain('randomtestcode');
    // Check that the identity was authenticated
    ({ exitCode, stdout } = await testUtils.pkStdio(
      ['identities', 'authenticated', '--format', 'json'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    ));
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      providerId: testToken.providerId,
      identityId: testToken.identityId,
    });
    // Check using providerId flag
    ({ exitCode, stdout } = await testUtils.pkStdio(
      [
        'identities',
        'authenticated',
        '--provider-id',
        testToken.providerId,
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
    ));
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual({
      providerId: testToken.providerId,
      identityId: testToken.identityId,
    });
  });
  test('should fail on invalid inputs', async () => {
    let exitCode;
    // Authenticate
    // Invalid provider
    ({ exitCode } = await testUtils.pkStdio(
      ['identities', 'authenticate', '', testToken.identityId],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      },
    ));
    expect(exitCode).toBe(sysexits.USAGE);
    // Authenticated
    // Invalid provider
    ({ exitCode } = await testUtils.pkStdio(
      ['identities', 'authenticate', ''],
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
