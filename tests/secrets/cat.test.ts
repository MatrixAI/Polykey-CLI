import type { VaultName } from 'polykey/dist/vaults/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import { vaultOps } from 'polykey/dist/vaults';
import * as keysUtils from 'polykey/dist/keys/utils';
import * as testUtils from '../utils';

describe('commandCatSecret', () => {
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
  test('should retrieve a secret', async () => {
    const vaultName = 'Vault3' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretName = 'secret-name';
    const secretContent = 'this is the contents of the secret';
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, secretName, secretContent);
    });
    const command = [
      'secrets',
      'cat',
      '-np',
      dataDir,
      `${vaultName}:${secretName}`,
    ];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(secretContent);
  });
  test('should fail when reading root without secret path', async () => {
    const vaultName = 'Vault3' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretName = 'secret-name';
    const secretContent = 'this is the contents of the secret';
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, secretName, secretContent);
    });
    const command = ['secrets', 'cat', '-np', dataDir, vaultName];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toBeDefined();
  });
  test('should concatenate multiple secrets', async () => {
    const vaultName = 'Vault3' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretName1 = 'secret-name1';
    const secretName2 = 'secret-name2';
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, secretName1, secretName1);
      await vaultOps.addSecret(vault, secretName2, secretName2);
    });
    const command = [
      'secrets',
      'cat',
      '-np',
      dataDir,
      `${vaultName}:${secretName1}`,
      `${vaultName}:${secretName2}`,
    ];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`${secretName1}${secretName2}`);
  });
  test('should concatenate secrets from multiple vaults', async () => {
    const vaultName1 = 'Vault3-1';
    const vaultName2 = 'Vault3-2';
    const vaultId1 = await polykeyAgent.vaultManager.createVault(vaultName1);
    const vaultId2 = await polykeyAgent.vaultManager.createVault(vaultName2);
    const secretName1 = 'secret-name1';
    const secretName2 = 'secret-name2';
    const secretName3 = 'secret-name3';
    await polykeyAgent.vaultManager.withVaults(
      [vaultId1, vaultId2],
      async (vault1, vault2) => {
        await vaultOps.addSecret(vault1, secretName1, secretName1);
        await vaultOps.addSecret(vault2, secretName2, secretName2);
        await vaultOps.addSecret(vault1, secretName3, secretName3);
      },
    );
    const command = [
      'secrets',
      'cat',
      '-np',
      dataDir,
      `${vaultName1}:${secretName1}`,
      `${vaultName2}:${secretName2}`,
      `${vaultName1}:${secretName3}`,
    ];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`${secretName1}${secretName2}${secretName3}`);
  });
  test('should ignore missing files when concatenating multiple files', async () => {
    const vaultName = 'Vault3';
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretName1 = 'secret-name1';
    const secretName2 = 'secret-name2';
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, secretName1, secretName1);
      await vaultOps.addSecret(vault, secretName2, secretName2);
    });
    const command = [
      'secrets',
      'cat',
      '-np',
      dataDir,
      `${vaultName}:${secretName1}`,
      `${vaultName}:doesnt-exist-file`,
      `${vaultName}:${secretName2}`,
    ];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(`${secretName1}${secretName2}`);
    expect(result.stderr).not.toBe('');
  });
  test('should return stdin if no arguments are passed', async () => {
    const command = ['secrets', 'cat', '-np', dataDir];
    const stdinData = 'this will go to stdin and come out of stdout';
    const childProcess = await testUtils.pkSpawn(
      command,
      {
        env: { PK_PASSWORD: password },
        cwd: dataDir,
      },
      logger,
    );
    let stdout: string = '';
    // The conditions of stdin/stdout being null will not be met in the test,
    // so we don't have to worry about the fields being null.
    childProcess.stdin!.write(stdinData);
    childProcess.stdin!.end();
    childProcess.stdout!.on('data', (data) => {
      stdout += data.toString();
    });
    const exitCode = await new Promise((resolve) => {
      childProcess.once('exit', (code) => {
        const exitCode = code ?? -255;
        childProcess.removeAllListeners('data');
        resolve(exitCode);
      });
    });
    expect(exitCode).toBe(0);
    expect(stdout).toBe(stdinData);
  });
});
