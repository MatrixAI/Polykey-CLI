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

  test(
    'should fail when vault does not exist',
    async () => {
      command = ['secrets', 'ls', '-np', dataDir, 'DoesntExist'];
      const result = await testUtils.pkStdio([...command], {
        env: {
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      });
      expect(result.exitCode).toBe(64); // Sysexits.USAGE
    },
    globalThis.defaultTimeout * 2,
  );

  test(
    'should list secrets',
    async () => {
      const vaultName = 'Vault4' as VaultName;
      const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);

      await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
        await vaultOps.addSecret(vault, 'MySecret1', '');
        await vaultOps.addSecret(vault, 'MySecret2', '');
        await vaultOps.addSecret(vault, 'MySecret3', '');
      });

      command = ['secrets', 'ls', '-np', dataDir, vaultName];
      const result = await testUtils.pkStdio([...command], {
        env: {
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('MySecret1\nMySecret2\nMySecret3\n');
    },
    globalThis.defaultTimeout * 2,
  );

  test(
    'should fail when path is not a directory',
    async () => {
      const vaultName = 'Vault5' as VaultName;
      const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);

      await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
        await vaultOps.mkdir(vault, 'SecretDir');
        await vaultOps.addSecret(vault, 'SecretDir/MySecret1', '');
        await vaultOps.addSecret(vault, 'SecretDir/MySecret2', '');
        await vaultOps.addSecret(vault, 'SecretDir/MySecret3', '');
      });

      command = ['secrets', 'ls', '-np', dataDir, `${vaultName}:WrongDirName`];
      let result = await testUtils.pkStdio([...command], {
        env: {
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      });
      expect(result.exitCode).toBe(64);

      command = [
        'secrets',
        'ls',
        '-np',
        dataDir,
        `${vaultName}:SecretDir/MySecret1`,
      ];
      result = await testUtils.pkStdio([...command], {
        env: {
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      });
      expect(result.exitCode).toBe(64);
    },
    globalThis.defaultTimeout * 2,
  );

  test(
    'should list secrets within directories',
    async () => {
      const vaultName = 'Vault6' as VaultName;
      const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);

      await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
        await vaultOps.mkdir(vault, 'SecretDir/NestedDir', { recursive: true });
        await vaultOps.addSecret(vault, 'SecretDir/MySecret1', '');
        await vaultOps.addSecret(vault, 'SecretDir/NestedDir/MySecret2', '');
      });

      command = ['secrets', 'ls', '-np', dataDir, `${vaultName}:SecretDir`];
      let result = await testUtils.pkStdio([...command], {
        env: {
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('SecretDir/MySecret1\nSecretDir/NestedDir\n');

      command = [
        'secrets',
        'ls',
        '-np',
        dataDir,
        `${vaultName}:SecretDir/NestedDir`,
      ];
      result = await testUtils.pkStdio([...command], {
        env: {
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('SecretDir/NestedDir/MySecret2\n');
    },
    globalThis.defaultTimeout * 2,
  );
});
