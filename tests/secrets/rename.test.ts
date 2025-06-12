import type { VaultName } from 'polykey/vaults/types.js';
import path from 'node:path';
import fs from 'node:fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/PolykeyAgent.js';
import { vaultOps } from 'polykey/vaults/index.js';
import * as keysUtils from 'polykey/keys/utils/index.js';
import * as testUtils from '../utils/index.js';

describe('commandRenameSecret', () => {
  const password = 'password';
  const logger = new Logger('CLI Test', LogLevel.WARN, [new StreamHandler()]);
  let dataDir: string;
  let polykeyAgent: PolykeyAgent;

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

  test('should rename secrets', async () => {
    const vaultName = 'vault' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const oldSecretName = 'secretOld';
    const newSecretName = 'secretNew';
    const secretContent = 'this is the secret for simple rename';
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, oldSecretName, secretContent);
    });

    // Should fail if only new name is provided
    const command1 = [
      'secrets',
      'rename',
      '-np',
      dataDir,
      `${vaultName}:${oldSecretName}`,
      newSecretName,
    ];
    const result1 = await testUtils.pkStdio(command1, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result1.exitCode).toBe(1);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual([oldSecretName]);
    });

    // Should pass if fully-qualified path is provided
    const command2 = [
      'secrets',
      'rename',
      '-np',
      dataDir,
      `${vaultName}:${oldSecretName}`,
      `${vaultName}:${newSecretName}`,
    ];
    const result2 = await testUtils.pkStdio(command2, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result2.exitCode).toBe(0);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual([newSecretName]);
    });
  });

  test('should fail renaming across vaults', async () => {
    const vaultName1 = 'vault1' as VaultName;
    const vaultName2 = 'vault2' as VaultName;
    const vaultId1 = await polykeyAgent.vaultManager.createVault(vaultName1);
    const vaultId2 = await polykeyAgent.vaultManager.createVault(vaultName2);
    const oldSecretName = 'secretOld';
    const newSecretName = 'secretNew';
    const secretContent = 'this is the secret for simple rename';
    await polykeyAgent.vaultManager.withVaults([vaultId1], async (vault) => {
      await vaultOps.addSecret(vault, oldSecretName, secretContent);
    });
    const command = [
      'secrets',
      'rename',
      '-np',
      dataDir,
      `${vaultName1}:${oldSecretName}`,
      `${vaultName2}:${newSecretName}`,
    ];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(1);
    await polykeyAgent.vaultManager.withVaults(
      [vaultId1, vaultId2],
      async (vault1, vault2) => {
        // The secret wasn't changed in the original place
        const list1 = await vaultOps.listSecrets(vault1);
        expect(list1.sort()).toStrictEqual([oldSecretName]);
        // The target vault is also unchanged
        const list2 = await vaultOps.listSecrets(vault2);
        expect(list2.sort()).toStrictEqual([]);
      },
    );
  });
});
