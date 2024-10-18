import type { VaultName } from 'polykey/dist/vaults/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import { vaultOps } from 'polykey/dist/vaults';
import * as keysUtils from 'polykey/dist/keys/utils';
import * as testUtils from '../utils';

describe('commandListSecrets', () => {
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

  test('should fail when vault does not exist', async () => {
    const command = ['secrets', 'ls', '-np', dataDir, 'doesnt-exist'];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).not.toBe(0);
  });
  test('should list root contents without specifying secret path', async () => {
    const vaultName = 'vault' as VaultName;
    const secretName1 = 'secret1';
    const secretName2 = 'secret2';
    const secretName3 = 'secret3';
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, secretName1, '');
      await vaultOps.addSecret(vault, secretName2, '');
      await vaultOps.addSecret(vault, secretName3, '');
    });
    const command = ['secrets', 'ls', '-np', dataDir, vaultName];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim().split('\n')).toEqual([
      secretName1,
      secretName2,
      secretName3,
    ]);
  });
  test('should list secrets', async () => {
    const vaultName = 'vault' as VaultName;
    const secretName1 = 'secret1';
    const secretName2 = 'secret2';
    const secretName3 = 'secret3';
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, secretName1, '');
      await vaultOps.addSecret(vault, secretName2, '');
      await vaultOps.addSecret(vault, secretName3, '');
    });
    const command = ['secrets', 'ls', '-np', dataDir, `${vaultName}:.`];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim().split('\n')).toEqual([
      secretName1,
      secretName2,
      secretName3,
    ]);
  });
  test('should fail when path is not a directory', async () => {
    const vaultName = 'vault' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const dirName = 'dir';
    const secretName = 'secret1';
    const secretDirName = path.join(dirName, secretName);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.mkdir(vault, dirName);
      await vaultOps.addSecret(vault, secretDirName, '');
    });
    let command = ['secrets', 'ls', '-np', dataDir, `${vaultName}:nodir`];
    let result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).not.toBe(0);
    command = [
      'secrets',
      'ls',
      '-np',
      dataDir,
      `${vaultName}:${secretDirName}`,
    ];
    result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).not.toBe(0);
  });

  test('should list secrets within directories', async () => {
    const vaultName = 'Vault4' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const dirName1 = 'dir1';
    const dirName2 = 'dir2';
    const secretName1 = 'secret1';
    const secretName2 = 'secret2';
    const nestedDir = path.join(dirName1, dirName2);
    const secretDirName1 = path.join(dirName1, secretName1);
    const secretDirName2 = path.join(nestedDir, secretName2);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.mkdir(vault, nestedDir, { recursive: true });
      await vaultOps.addSecret(vault, secretDirName1, '');
      await vaultOps.addSecret(vault, secretDirName2, '');
    });
    let command = ['secrets', 'ls', '-np', dataDir, `${vaultName}:${dirName1}`];
    let result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim().split('\n')).toEqual([
      nestedDir,
      secretDirName1,
    ]);
    command = ['secrets', 'ls', '-np', dataDir, `${vaultName}:${nestedDir}`];
    result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`${secretDirName2}\n`);
  });
});
