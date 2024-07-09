import type { VaultName } from 'polykey/dist/vaults/types';
import path from 'path';
import fs from 'fs';
import { test } from '@fast-check/jest';
import fc from 'fast-check';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/dist/PolykeyAgent';
import { vaultOps } from 'polykey/dist/vaults';
import * as keysUtils from 'polykey/dist/keys/utils';
import * as testUtils from '../utils';

describe('commandCreateSecret', () => {
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
    'should create secrets',
    async () => {
      const vaultName = 'Vault1' as VaultName;
      const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
      const secretPath = path.join(dataDir, 'secret');
      await fs.promises.writeFile(secretPath, 'this is a secret');

      command = [
        'secrets',
        'create',
        '-np',
        dataDir,
        secretPath,
        `${vaultName}:MySecret`,
      ];

      const result = await testUtils.pkStdio([...command], {
        env: {
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      });
      expect(result.exitCode).toBe(0);

      await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
        const list = await vaultOps.listSecrets(vault);
        expect(list.sort()).toStrictEqual(['MySecret']);
        expect(
          (await vaultOps.getSecret(vault, 'MySecret')).toString(),
        ).toStrictEqual('this is a secret');
      });
    },
    globalThis.defaultTimeout * 2,
  );
  const fileNameArb = fc.stringMatching(/^[^\0\\/=]$/);
  const envVariableArb = fc.stringMatching(/^([a-zA-Z_][\w]+)?$/);
  test.prop([fileNameArb, fileNameArb, envVariableArb], { numRuns: 10 })(
    'secrets handle unix style paths for secrets',
    async (directoryName, secretName, envVariableName) => {
      await polykeyAgent.vaultManager.stop();
      await polykeyAgent.vaultManager.start({ fresh: true });
      const vaultName = 'Vault1' as VaultName;
      const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
      const secretPath = path.join(dataDir, 'secret');
      await fs.promises.writeFile(secretPath, 'this is a secret');
      const vaultsSecretPath = path.join(directoryName, secretName);

      command = [
        'secrets',
        'create',
        '-np',
        dataDir,
        secretPath,
        `${vaultName}:${vaultsSecretPath}=${envVariableName}`,
      ];

      const result = await testUtils.pkStdio([...command], {
        env: {
          PK_PASSWORD: password,
        },
        cwd: dataDir,
      });
      expect(result.exitCode).toBe(0);

      await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
        const list = await vaultOps.listSecrets(vault);
        expect(list.sort()).toStrictEqual([vaultsSecretPath]);
        expect(
          (await vaultOps.getSecret(vault, vaultsSecretPath)).toString(),
        ).toStrictEqual('this is a secret');
      });
    },
  );
});
