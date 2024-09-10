import type { VaultName } from 'polykey/dist/vaults/types';
import path from 'path';
import fs from 'fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import { vaultOps } from 'polykey/dist/vaults';
import * as keysUtils from 'polykey/dist/keys/utils';
import * as testUtils from '../utils';

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

  test('should remove secret', async () => {
    const vaultName = 'Vault2' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, 'MySecret', 'this is the secret');
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual(['MySecret']);
    });

    const command = ['secrets', 'rm', '-np', dataDir, `${vaultName}:MySecret`];

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

  test('should remove multiple secrets', async () => {
    const vaultName = 'Vault2' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretNames = ['secret1', 'secret2', 'secret3'];

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      for (const secretName of secretNames) {
        await vaultOps.addSecret(vault, secretName, secretName);
      }
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual(secretNames);
    });

    const secretPaths = secretNames.map((v) => `${vaultName}:${v}`);
    const command = ['secrets', 'rm', '-np', dataDir, ...secretPaths];

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

  test('should make one log message for deleting multiple secrets', async () => {
    const vaultName = 'Vault2' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretNames = ['secret1', 'secret2', 'secret3'];
    let vaultLogLength: number;

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      for (const secretName of secretNames) {
        await vaultOps.addSecret(vault, secretName, secretName);
      }
      vaultLogLength = (await vault.log()).length;
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual(secretNames);
    });

    const secretPaths = secretNames.map((v) => `${vaultName}:${v}`);
    const command = ['secrets', 'rm', '-np', dataDir, ...secretPaths];

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
    const vaultName = 'Vault2' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretDir = 'secretDir';
    const secretNames = ['secret1', 'secret2', 'secret3'].map((v) =>
      path.join(secretDir, v),
    );

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.mkdir(vault, secretDir);
      for (const secretName of secretNames) {
        await vaultOps.addSecret(vault, secretName, secretName);
      }
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual(secretNames);
    });

    const command = [
      'secrets',
      'rm',
      '-np',
      dataDir,
      `${vaultName}:secretDir`,
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
    const vaultName = 'Vault2' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretDir = 'secretDir';
    const secretNames = ['secret1', 'secret2', 'secret3'].map((v) =>
      path.join(secretDir, v),
    );

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.mkdir(vault, secretDir);
      for (const secretName of secretNames) {
        await vaultOps.addSecret(vault, secretName, secretName);
      }
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual(secretNames);
    });

    const command = ['secrets', 'rm', '-np', dataDir, `${vaultName}:secretDir`];

    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).not.toBe(0);

    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual(secretNames);
    });
  });

  test('should remove files from multiple vaults in the same command', async () => {
    const vaultName1 = 'Vault2-1' as VaultName;
    const vaultName2 = 'Vault2-2' as VaultName;
    const vaultId1 = await polykeyAgent.vaultManager.createVault(vaultName1);
    const vaultId2 = await polykeyAgent.vaultManager.createVault(vaultName2);
    const secretNames1 = ['secret1', 'secret2', 'secret3'];
    const secretNames2 = ['secret4', 'secret5'];

    await polykeyAgent.vaultManager.withVaults([vaultId1], async (vault) => {
      for (const secretName of secretNames1) {
        await vaultOps.addSecret(vault, secretName, secretName);
      }
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual(secretNames1);
    });

    await polykeyAgent.vaultManager.withVaults([vaultId2], async (vault) => {
      for (const secretName of secretNames2) {
        await vaultOps.addSecret(vault, secretName, secretName);
      }
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual(secretNames2);
    });

    const command = [
      'secrets',
      'rm',
      '-np',
      dataDir,
      ...secretNames1.map((v) => `${vaultName1}:${v}`),
      ...secretNames2.map((v) => `${vaultName2}:${v}`),
    ];

    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);

    await polykeyAgent.vaultManager.withVaults([vaultId1], async (vault) => {
      const list = await vaultOps.listSecrets(vault);
      expect(list).toStrictEqual([]);
    });
    await polykeyAgent.vaultManager.withVaults([vaultId2], async (vault) => {
      const list = await vaultOps.listSecrets(vault);
      expect(list).toStrictEqual([]);
    });
  });
});
