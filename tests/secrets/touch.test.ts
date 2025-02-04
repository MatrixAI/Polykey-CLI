import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import { vaultOps } from 'polykey/dist/vaults';
import * as keysUtils from 'polykey/dist/keys/utils';
import * as testUtils from '../utils';

describe('commandTouch', () => {
  const password = 'password';
  const logger = new Logger('CLI Test', LogLevel.WARN, [new StreamHandler()]);
  let dataDir: string;
  let polykeyAgent: PolykeyAgent;

  beforeEach(async () => {
    dataDir = await fs.promises.mkdtemp(
      path.join(globalThis.tmpDir, 'polykey-test-'),
    );
    polykeyAgent = await PolykeyAgent.createPolykeyAgent({
      password: password,
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

  test('should create a secret if it does not exist', async () => {
    const vaultName = 'vault';
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretName = 'secret';
    const command = [
      'secrets',
      'touch',
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
      await vault.readF(async (efs) => {
        await expect(efs.exists(secretName)).resolves.toBeTruthy();
      });
    });
  });
  test('should update mtime if secret exists', async () => {
    const vaultName = 'vault';
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretName = 'secret';
    let oldMtime: Date | undefined = undefined;
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.writeSecret(vault, secretName, secretName);
      oldMtime = await vault.readF(async (efs) => {
        return (await efs.stat(secretName)).mtime;
      });
    });
    if (oldMtime == null) fail('Mtime cannot be nullish');
    const command = [
      'secrets',
      'touch',
      '-np',
      dataDir,
      `${vaultName}:${secretName}`,
    ];
    const startTime = new Date();
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    const endTime = new Date();
    expect(result.exitCode).toBe(0);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vault.readF(async (efs) => {
        await expect(efs.exists(secretName)).resolves.toBeTruthy();
        // File content isn't modified
        const content = await efs.readFile(secretName);
        expect(content.toString()).toEqual(secretName);
        // Timestamp has changed
        const stat = await efs.stat(secretName);
        expect(
          stat.mtime >= startTime &&
            stat.mtime <= endTime &&
            stat.mtime !== oldMtime,
        ).toBeTruthy();
      });
    });
  });
  test('should update mtime if directory exists', async () => {
    const vaultName = 'vault';
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const dirName = 'dir';
    let oldMtime: Date | undefined = undefined;
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.mkdir(vault, dirName);
      oldMtime = await vault.readF(async (efs) => {
        return (await efs.stat(dirName)).mtime;
      });
    });
    if (oldMtime == null) fail('Mtime cannot be nullish');
    const command = [
      'secrets',
      'touch',
      '-np',
      dataDir,
      `${vaultName}:${dirName}`,
    ];
    const startTime = new Date();
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    const endTime = new Date();
    expect(result.exitCode).toBe(0);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vault.readF(async (efs) => {
        await expect(efs.exists(dirName)).resolves.toBeTruthy();
        // Timestamp has changed
        const stat = await efs.stat(dirName);
        expect(
          stat.mtime >= startTime &&
            stat.mtime <= endTime &&
            stat.mtime !== oldMtime,
        ).toBeTruthy();
      });
    });
  });
  test('should fail if parent directory does not exist', async () => {
    const vaultName = 'vault';
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretName = path.join('dir', 'secret');
    const command = [
      'secrets',
      'touch',
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
      await vault.readF(async (efs) => {
        await expect(efs.exists(secretName)).resolves.toBeFalsy();
      });
    });
  });
});
