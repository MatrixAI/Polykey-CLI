import type { VaultName } from 'polykey/dist/vaults/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import { vaultOps } from 'polykey/dist/vaults';
import * as keysUtils from 'polykey/dist/keys/utils';
import * as testUtils from '../utils';

describe('commandMkdir', () => {
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

  test('should make a directory', async () => {
    const vaultName = 'vault' as VaultName;
    const dirName = 'dir';
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    command = ['secrets', 'mkdir', '-np', dataDir, `${vaultName}:${dirName}`];
    const result = await testUtils.pkStdio([...command], {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const stat = await vaultOps.statSecret(vault, dirName);
      expect(stat.isDirectory()).toBeTruthy();
    });
  });
  test('should fail when provided only the vault name', async () => {
    const vaultName = 'vault' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    command = ['secrets', 'mkdir', '-np', dataDir, vaultName];
    const result = await testUtils.pkStdio([...command], {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toInclude('EEXIST'); // Root directory is already a directory
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      expect(await vaultOps.listSecrets(vault)).toEqual([]);
    });
  });
  test('should make directories recursively', async () => {
    const vaultName = 'vault' as VaultName;
    const dirName1 = 'dir1';
    const dirName2 = 'dir2';
    const dirNameNested = path.join(dirName1, dirName2);
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    command = [
      'secrets',
      'mkdir',
      '-np',
      dataDir,
      `${vaultName}:${dirNameNested}`,
      '--parents',
    ];
    const result = await testUtils.pkStdio([...command], {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const stat1 = await vaultOps.statSecret(vault, dirName1);
      expect(stat1.isDirectory()).toBeTruthy();
      const stat2 = await vaultOps.statSecret(vault, dirNameNested);
      expect(stat2.isDirectory()).toBeTruthy();
    });
  });
  test('should fail without recursive set', async () => {
    const vaultName = 'vault' as VaultName;
    const dirName1 = 'dir1';
    const dirName2 = 'dir2';
    const dirNameNested = path.join(dirName1, dirName2);
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    command = [
      'secrets',
      'mkdir',
      '-np',
      dataDir,
      `${vaultName}:${dirNameNested}`,
    ];
    const result = await testUtils.pkStdio([...command], {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toInclude('ENOENT');
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vault.readF(async (efs) => {
        const dirName1P = efs.readdir(dirName1);
        await expect(dirName1P).rejects.toThrow('ENOENT');
        const dirNameNestedP = efs.readdir(dirNameNested);
        await expect(dirNameNestedP).rejects.toThrow('ENOENT');
      });
    });
  });
  test('should fail to make existing directory', async () => {
    const vaultName = 'vault' as VaultName;
    const dirName = 'dir-exists';
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vault.writeF(async (efs) => {
        await efs.mkdir(dirName);
      });
    });
    command = ['secrets', 'mkdir', '-np', dataDir, `${vaultName}:${dirName}`];
    const result = await testUtils.pkStdio([...command], {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toInclude('EEXIST');
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vault.readF(async (efs) => {
        const dirP = efs.readdir(dirName);
        await expect(dirP).toResolve();
      });
    });
  });
  test('should fail to make existing secret', async () => {
    const vaultName = 'vault' as VaultName;
    const secretName = 'secret-exists';
    const secretContent = 'secret-content';
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vault.writeF(async (efs) => {
        await efs.writeFile(secretName, secretContent);
      });
    });
    command = [
      'secrets',
      'mkdir',
      '-np',
      dataDir,
      `${vaultName}:${secretName}`,
    ];
    const result = await testUtils.pkStdio([...command], {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toInclude('EEXIST');
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vault.readF(async (efs) => {
        const stat = await efs.stat(secretName);
        expect(stat.isFile()).toBeTruthy();
        const contents = await efs.readFile(secretName);
        expect(contents.toString()).toEqual(secretContent);
      });
    });
  });
  test('should make directories in multiple vaults', async () => {
    const vaultName1 = 'vault1' as VaultName;
    const vaultName2 = 'vault2' as VaultName;
    const vaultId1 = await polykeyAgent.vaultManager.createVault(vaultName1);
    const vaultId2 = await polykeyAgent.vaultManager.createVault(vaultName2);
    const dirName1 = 'dir1';
    const dirName2 = 'dir2';
    const dirName3 = 'dir3';
    command = [
      'secrets',
      'mkdir',
      '-np',
      dataDir,
      `${vaultName1}:${dirName1}`,
      `${vaultName2}:${dirName2}`,
      `${vaultName1}:${dirName3}`,
    ];
    const result = await testUtils.pkStdio([...command], {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    await polykeyAgent.vaultManager.withVaults(
      [vaultId1, vaultId2],
      async (vault1, vault2) => {
        const stat1 = await vaultOps.statSecret(vault1, dirName1);
        expect(stat1.isDirectory()).toBeTruthy();
        const stat2 = await vaultOps.statSecret(vault2, dirName2);
        expect(stat2.isDirectory()).toBeTruthy();
        const stat3 = await vaultOps.statSecret(vault1, dirName3);
        expect(stat3.isDirectory()).toBeTruthy();
      },
    );
  });
  test('should continue after error', async () => {
    const vaultName1 = 'vault1' as VaultName;
    const vaultName2 = 'vault2' as VaultName;
    const vaultId1 = await polykeyAgent.vaultManager.createVault(vaultName1);
    const vaultId2 = await polykeyAgent.vaultManager.createVault(vaultName2);
    const dirName1 = 'dir1';
    const dirName2 = 'nodir/dir2';
    const dirName3 = 'dir3';
    const dirName4 = 'dir4';
    command = [
      'secrets',
      'mkdir',
      '-np',
      dataDir,
      `${vaultName1}:${dirName1}`,
      `${vaultName2}:${dirName2}`,
      `${vaultName2}:${dirName3}`,
      `${vaultName1}:${dirName4}`,
    ];
    const result = await testUtils.pkStdio([...command], {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toInclude('ENOENT');
    await polykeyAgent.vaultManager.withVaults(
      [vaultId1, vaultId2],
      async (vault1, vault2) => {
        const stat1 = await vaultOps.statSecret(vault1, dirName1);
        expect(stat1.isDirectory()).toBeTruthy();
        await expect(vaultOps.statSecret(vault2, dirName2)).toReject();
        const stat3 = await vaultOps.statSecret(vault2, dirName3);
        expect(stat3.isDirectory()).toBeTruthy();
        const stat4 = await vaultOps.statSecret(vault1, dirName4);
        expect(stat4.isDirectory()).toBeTruthy();
      },
    );
  });
});
