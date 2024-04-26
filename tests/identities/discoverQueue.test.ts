import type { IdentityId, ProviderId } from 'polykey/dist/identities/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import * as keysUtils from 'polykey/dist/keys/utils';
import * as testUtils from '../utils';

describe('discovery queue', () => {
  const logger = new Logger('discovery queue test', LogLevel.WARN, [
    new StreamHandler(),
  ]);
  const password = 'password';
  let dataDir: string;
  let nodePath: string;
  let pkAgent: PolykeyAgent;
  let node: PolykeyAgent;
  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'polykey-test-'),
    );
    nodePath = path.join(dataDir, 'polykey');
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
    // Set up a gestalt to modify the permissions of
    const nodePathGestalt = path.join(dataDir, 'gestalt');
    node = await PolykeyAgent.createPolykeyAgent({
      password,
      options: {
        nodePath: nodePathGestalt,
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
  });
  afterEach(async () => {
    await node.stop();
    await pkAgent.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });

  test('should return discovery queue', async () => {
    // Scheduling discovery tasks
    await pkAgent.taskManager.stopProcessing();
    await pkAgent.discovery.queueDiscoveryByIdentity(
      'provider' as ProviderId,
      'identity1' as IdentityId,
    );
    await pkAgent.discovery.queueDiscoveryByIdentity(
      'provider' as ProviderId,
      'identity2' as IdentityId,
    );
    await pkAgent.discovery.queueDiscoveryByIdentity(
      'provider' as ProviderId,
      'identity3' as IdentityId,
    );

    // Doing test
    const result = await testUtils.pkStdio(
      ['identities', 'queue', '--format', 'json'],
      {
        env: {
          PK_NODE_PATH: nodePath,
          PK_PASSWORD: password,
        },
      },
    );
    expect(result.stdout).toIncludeMultiple([
      'identity1',
      'identity2',
      'identity3',
    ]);
    expect(result.exitCode).toBe(0);
  });
});
