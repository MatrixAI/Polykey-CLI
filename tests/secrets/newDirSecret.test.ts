import type { VaultName } from 'polykey/vaults/types.js';
import path from 'node:path';
import fs from 'node:fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/PolykeyAgent.js';
import { vaultOps } from 'polykey/vaults/index.js';
import * as keysUtils from 'polykey/keys/utils/index.js';
import * as testUtils from '../utils/index.js';

describe('commandNewDirSecret', () => {
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

  test('should add a directory of secrets', async () => {
    const vaultName = 'vault' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretDirName = 'secrets';
    const secretDirPathName = path.join(dataDir, secretDirName);
    const secretName1 = 'secret1';
    const secretName2 = 'secret2';
    const secretName3 = 'secret3';
    const secretPath1 = path.join(secretDirPathName, secretName1);
    const secretPath2 = path.join(secretDirPathName, secretName2);
    const secretPath3 = path.join(secretDirPathName, secretName3);
    await fs.promises.mkdir(secretDirPathName);
    await fs.promises.writeFile(secretPath1, secretPath1);
    await fs.promises.writeFile(secretPath2, secretPath2);
    await fs.promises.writeFile(secretPath3, secretPath3);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual([]);
    });
    command = ['secrets', 'dir', '-np', dataDir, secretDirPathName, vaultName];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const list = await vaultOps.listSecrets(vault);
      // The secretPath includes the full local path. We need relative vault
      // path, which only needs the actual directory name and the secret name.
      expect(list.sort()).toStrictEqual([
        path.join(secretDirName, secretName1),
        path.join(secretDirName, secretName2),
        path.join(secretDirName, secretName3),
      ]);
    });
  });
});
