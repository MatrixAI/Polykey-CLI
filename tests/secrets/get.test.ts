import type { VaultName } from 'polykey/dist/vaults/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import { vaultOps } from 'polykey/dist/vaults';
import * as keysUtils from 'polykey/dist/keys/utils';
import * as testUtils from '../utils';

describe('commandGetSecret', () => {
  const password = 'password';
  const logger = new Logger('CLI Test', LogLevel.WARN, [new StreamHandler()]);
  let dataDir: string;
  let polykeyAgent: PolykeyAgent;
  let command: Array<string>;

  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'polykey-test-'),
    );
    polykeyAgent = await PolykeyAgent.createPolykeyAgent({
      password,
      options: {
        nodePath: dataDir,
        agentServiceHost: '127.0.0.1',
        clientServiceHost: '127.0.0.1',
        keys: {
          passwordOpsLimit: keysUtils.passwordOpsLimits.min,
          passwordMemLimit: keysUtils.passwordMemLimits.min,
          strictMemoryLock: false,
        },
      },
      logger: logger,
    });
  });
  afterEach(async () => {
    await polykeyAgent.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });

  test('should retrieve secrets', async () => {
    const vaultName = 'Vault3' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, 'MySecret', 'this is the secret');
    });

    command = ['secrets', 'get', '-np', dataDir, `${vaultName}:MySecret`];

    const result = await testUtils.pkStdio([...command], {
      env: {
        PK_PASSWORD: password,
      },
      cwd: dataDir,
    });
    expect(result.stdout).toBe('this is the secret');
    expect(result.exitCode).toBe(0);
  });
});
