import type { VaultName } from 'polykey/vaults/types.js';
import path from 'node:path';
import fs from 'node:fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/PolykeyAgent.js';
import { vaultOps } from 'polykey/vaults/index.js';
import * as keysUtils from 'polykey/keys/utils/index.js';
import * as testUtils from '../utils/index.js';

describe('commandRemoveSecret', () => {
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

  test('should fail with invalid vault name', async () => {
    const vaultName = 'vault' as VaultName;
    const secretName = 'secret';
    const command = [
      'secrets',
      'rm',
      '-np',
      dataDir,
      `${vaultName}:${secretName}`,
    ];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toInclude('ErrorVaultsVaultUndefined');
  });
  test('should remove secret', async () => {
    const vaultName = 'vault' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretName = 'secret';
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, secretName, secretName);
    });
    const command = [
      'secrets',
      'rm',
      '-np',
      dataDir,
      `${vaultName}:${secretName}`,
    ];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual([]);
    });
  });
  test('should fail to remove vault root', async () => {
    const vaultName = 'vault' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretName = 'secret';
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, secretName, secretName);
    });
    const command = ['secrets', 'rm', '-np', dataDir, vaultName];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toInclude('Permission denied');
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual([secretName]);
    });
  });
  test('should fail to remove non-existent path', async () => {
    const vaultName = 'vault' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretName = 'secret';
    const command = [
      'secrets',
      'rm',
      '-np',
      dataDir,
      `${vaultName}:${secretName}`,
    ];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toInclude('No such file or directory');
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual([]);
    });
  });
  test('should remove multiple secrets', async () => {
    const vaultName = 'vault' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretName1 = 'secret1';
    const secretName2 = 'secret2';
    const secretName3 = 'secret3';
    const secretName4 = 'secret4';
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, secretName1, secretName1);
      await vaultOps.addSecret(vault, secretName2, secretName2);
      await vaultOps.addSecret(vault, secretName3, secretName3);
      await vaultOps.addSecret(vault, secretName4, secretName4);
    });
    const command = [
      'secrets',
      'rm',
      '-np',
      dataDir,
      `${vaultName}:${secretName1}`,
      `${vaultName}:${secretName2}`,
      `${vaultName}:${secretName3}`,
    ];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual([secretName4]);
    });
  });
  test('should make one log message for deleting multiple secrets', async () => {
    const vaultName = 'vault' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretName1 = 'secret1';
    const secretName2 = 'secret2';
    const secretName3 = 'secret3';
    let vaultLogLength: number;
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, secretName1, secretName1);
      await vaultOps.addSecret(vault, secretName2, secretName2);
      await vaultOps.addSecret(vault, secretName3, secretName3);
      vaultLogLength = (await vault.log()).length;
    });
    const command = [
      'secrets',
      'rm',
      '-np',
      dataDir,
      `${vaultName}:${secretName1}`,
      `${vaultName}:${secretName2}`,
      `${vaultName}:${secretName3}`,
    ];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual([]);
      expect((await vault.log()).length).toEqual(vaultLogLength + 1);
    });
  });
  test('should remove secrets recursively', async () => {
    const vaultName = 'vault' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretDirName = 'dir';
    const secretName1 = 'secret1';
    const secretName2 = 'secret2';
    const secretName3 = 'secret3';
    const secretPath1 = path.join(secretDirName, secretName1);
    const secretPath2 = path.join(secretDirName, secretName2);
    const secretPath3 = path.join(secretDirName, secretName3);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.mkdir(vault, secretDirName);
      await vaultOps.addSecret(vault, secretPath1, secretPath1);
      await vaultOps.addSecret(vault, secretPath2, secretPath2);
      await vaultOps.addSecret(vault, secretPath3, secretPath3);
    });
    const command = [
      'secrets',
      'rm',
      '-np',
      dataDir,
      `${vaultName}:${secretDirName}`,
      '--recursive',
    ];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual([]);
    });
  });
  test('should fail to remove directory without recursive flag', async () => {
    const vaultName = 'vault' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretDirName = 'dir';
    const secretName1 = 'secret1';
    const secretName2 = 'secret2';
    const secretName3 = 'secret3';
    const secretPath1 = path.join(secretDirName, secretName1);
    const secretPath2 = path.join(secretDirName, secretName2);
    const secretPath3 = path.join(secretDirName, secretName3);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.mkdir(vault, secretDirName);
      await vaultOps.addSecret(vault, secretPath1, secretPath1);
      await vaultOps.addSecret(vault, secretPath2, secretPath2);
      await vaultOps.addSecret(vault, secretPath3, secretPath3);
    });
    const command = [
      'secrets',
      'rm',
      '-np',
      dataDir,
      `${vaultName}:${secretDirName}`,
    ];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toInclude('Is a directory');
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual([
        secretPath1,
        secretPath2,
        secretPath3,
      ]);
    });
  });
  test('should remove files from multiple vaults in the same command', async () => {
    const vaultName1 = 'vault-1' as VaultName;
    const vaultName2 = 'vault-2' as VaultName;
    const vaultId1 = await polykeyAgent.vaultManager.createVault(vaultName1);
    const vaultId2 = await polykeyAgent.vaultManager.createVault(vaultName2);
    const secretName1 = 'secret1';
    const secretName2 = 'secret2';
    const secretName3 = 'secret3';
    const secretName4 = 'secret4';
    const secretName5 = 'secret5';
    const secretName6 = 'secret6';
    await polykeyAgent.vaultManager.withVaults(
      [vaultId1, vaultId2],
      async (vault1, vault2) => {
        await vaultOps.addSecret(vault1, secretName1, secretName1);
        await vaultOps.addSecret(vault1, secretName2, secretName2);
        await vaultOps.addSecret(vault1, secretName3, secretName3);
        await vaultOps.addSecret(vault1, secretName4, secretName4);
        await vaultOps.addSecret(vault2, secretName5, secretName5);
        await vaultOps.addSecret(vault2, secretName6, secretName6);
      },
    );
    const command = [
      'secrets',
      'rm',
      '-np',
      dataDir,
      `${vaultName1}:${secretName1}`,
      `${vaultName1}:${secretName2}`,
      `${vaultName1}:${secretName3}`,
      `${vaultName2}:${secretName5}`,
    ];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    await polykeyAgent.vaultManager.withVaults(
      [vaultId1, vaultId2],
      async (vault1, vault2) => {
        const list1 = await vaultOps.listSecrets(vault1);
        expect(list1).toStrictEqual([secretName4]);
        const list2 = await vaultOps.listSecrets(vault2);
        expect(list2).toStrictEqual([secretName6]);
      },
    );
  });
});
