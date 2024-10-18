import type { VaultName } from 'polykey/dist/vaults/types';
import path from 'path';
import fs from 'fs';
import fc from 'fast-check';
import { test } from '@fast-check/jest';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import { vaultOps } from 'polykey/dist/vaults';
import * as keysUtils from 'polykey/dist/keys/utils';
import * as testUtils from '../utils';

describe('commandWriteFile', () => {
  const password = 'password';
  const logger = new Logger('CLI Test', LogLevel.WARN, [new StreamHandler()]);
  const stdinArb = fc.string({ minLength: 0, maxLength: 100 });
  const contentArb = fc.constantFrom('content', '');
  let dataDir: string;
  let polykeyAgent: PolykeyAgent;
  let command: Array<string>;
  let vaultNumber: number = 0;

  // Helper function to generate unique vault names
  function genVaultName() {
    vaultNumber++;
    return `vault-${vaultNumber}` as VaultName;
  }

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

  test.prop([stdinArb, contentArb], { numRuns: 1 })(
    'should write secret',
    async (stdinData, secretContent) => {
      const vaultName = genVaultName();
      const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
      const secretName = 'secret';
      await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
        await vaultOps.addSecret(vault, secretName, secretContent);
      });
      command = [
        'secrets',
        'write',
        '-np',
        dataDir,
        `${vaultName}:${secretName}`,
      ];

      const childProcess = await testUtils.pkSpawn(
        command,
        {
          env: { PK_PASSWORD: password },
          cwd: dataDir,
        },
        logger,
      );
      // The conditions of stdin being null will not be met in the test, so we
      // don't have to worry about the fields being null.
      childProcess.stdin!.write(stdinData);
      childProcess.stdin!.end();
      const exitCode = await new Promise((resolve) => {
        childProcess.once('exit', (code) => {
          const exitCode = code ?? -255;
          childProcess.removeAllListeners('data');
          resolve(exitCode);
        });
      });
      expect(exitCode).toStrictEqual(0);
      await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
        const contents = await vaultOps.getSecret(vault, secretName);
        expect(contents.toString()).toStrictEqual(stdinData);
      });
    },
  );
  test.prop([stdinArb], { numRuns: 1 })(
    'should fail writing when secret path is not specified',
    async (stdinData) => {
      const vaultName = genVaultName();
      await polykeyAgent.vaultManager.createVault(vaultName);
      command = [
        'secrets',
        'write',
        '-np',
        dataDir,
        vaultName
      ];

      const childProcess = await testUtils.pkSpawn(
        command,
        {
          env: { PK_PASSWORD: password },
          cwd: dataDir,
        },
        logger,
      );
      // The conditions of stdin being null will not be met in the test, so we
      // don't have to worry about the fields being null.
      childProcess.stdin!.write(stdinData);
      childProcess.stdin!.end();
      const exitCode = await new Promise((resolve) => {
        childProcess.once('exit', (code) => {
          const exitCode = code ?? -255;
          childProcess.removeAllListeners('data');
          resolve(exitCode);
        });
      });
      expect(exitCode).not.toBe(0);
    },
  );
  test('should overwrite secret', async () => {
    const vaultName = 'vault' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretName = 'secret';
    const newContent = 'new contents';
    command = [
      'secrets',
      'write',
      '-np',
      dataDir,
      `${vaultName}:${secretName}`,
    ];

    const childProcess = await testUtils.pkSpawn(
      command,
      {
        env: { PK_PASSWORD: password },
        cwd: dataDir,
      },
      logger,
    );
    // The conditions of stdin being null will not be met in the test, so we
    // don't have to worry about the fields being null.
    childProcess.stdin!.write(newContent);
    childProcess.stdin!.end();
    const exitCode = await new Promise((resolve) => {
      childProcess.once('exit', (code) => {
        const exitCode = code ?? -255;
        childProcess.removeAllListeners('data');
        resolve(exitCode);
      });
    });
    expect(exitCode).toStrictEqual(0);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const contents = await vaultOps.getSecret(vault, secretName);
      expect(contents.toString()).toStrictEqual(newContent);
    });
  });
});
