import type { VaultName } from 'polykey/dist/vaults/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import { vaultOps } from 'polykey/dist/vaults';
import * as keysUtils from 'polykey/dist/keys/utils';
import * as testUtils from '../utils';

describe('commandUpdateSecret', () => {
  const password = 'password';
  const logger = new Logger('CLI Test', LogLevel.WARN, [new StreamHandler()]);
  let dataDir: string;
  let polykeyAgent: PolykeyAgent;
  let passwordFile: string;
  let command: Array<string>;

  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'polykey-test-'),
    );
    passwordFile = path.join(dataDir, 'passwordFile');
    await fs.promises.writeFile(passwordFile, 'password');
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
    // Authorize session
    await testUtils.pkStdio(
      ['agent', 'unlock', '-np', dataDir, '--password-file', passwordFile],
      {
        env: {},
        cwd: dataDir,
      },
    );
  });
  afterEach(async () => {
    await polykeyAgent.stop();
    await fs.promises.rm(dataDir, {
      force: true,
      recursive: true,
    });
  });

  test('should update secrets', async () => {
    const vaultName = 'Vault7' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);

    const secretPath = path.join(dataDir, 'secret');
    await fs.promises.writeFile(secretPath, 'updated-content');

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, 'MySecret', 'original-content');
      expect(
        (await vaultOps.getSecret(vault, 'MySecret')).toString(),
      ).toStrictEqual('original-content');
    });

    command = [
      'secrets',
      'update',
      '-np',
      dataDir,
      secretPath,
      `${vaultName}:MySecret`,
    ];

    const result2 = await testUtils.pkStdio([...command], {
      env: {},
      cwd: dataDir,
    });
    expect(result2.exitCode).toBe(0);

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual(['MySecret']);
      expect(
        (await vaultOps.getSecret(vault, 'MySecret')).toString(),
      ).toStrictEqual('updated-content');
    });
  });
});
