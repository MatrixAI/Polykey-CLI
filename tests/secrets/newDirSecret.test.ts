import type { VaultName } from 'polykey/dist/vaults/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import { vaultOps } from 'polykey/dist/vaults';
import * as keysUtils from 'polykey/dist/keys/utils';
import * as testUtils from '../utils';

describe('commandNewDirSecret', () => {
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

  test('should add a directory of secrets', async () => {
    const vaultName = 'Vault8' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);

    const secretDir = path.join(dataDir, 'secrets');
    await fs.promises.mkdir(secretDir);
    await fs.promises.writeFile(
      path.join(secretDir, 'secret-1'),
      'this is the secret 1',
    );
    await fs.promises.writeFile(
      path.join(secretDir, 'secret-2'),
      'this is the secret 2',
    );
    await fs.promises.writeFile(
      path.join(secretDir, 'secret-3'),
      'this is the secret 3',
    );

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual([]);
    });

    command = ['secrets', 'dir', '-np', dataDir, secretDir, vaultName];

    const result2 = await testUtils.pkStdio([...command], {
      env: {},
      cwd: dataDir,
    });
    expect(result2.exitCode).toBe(0);

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual([
        'secrets/secret-1',
        'secrets/secret-2',
        'secrets/secret-3',
      ]);
    });
  });
});
