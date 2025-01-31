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

  const fileNameArb = fc.stringMatching(/^[^\0\\/=]$/);
  const envVariableArb = fc.stringMatching(/^([a-zA-Z_][\w]+)?$/);

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

  test('should create secrets', async () => {
    const vaultName = 'vault' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const secretPath = path.join(dataDir, 'secret');
    const vaultSecretName = 'vault-secret';
    const secretContent = 'this is a secret';
    await fs.promises.writeFile(secretPath, secretContent);
    const command = [
      'secrets',
      'create',
      '-np',
      dataDir,
      secretPath,
      `${vaultName}:${vaultSecretName}`,
    ];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual([vaultSecretName]);
      expect(
        (await vaultOps.getSecret(vault, vaultSecretName)).toString(),
      ).toStrictEqual(secretContent);
    });
  });
  test('should fail without providing secret path', async () => {
    const vaultName = 'vault' as VaultName;
    await polykeyAgent.vaultManager.createVault(vaultName);
    const secretName = path.join(dataDir, 'secret');
    await fs.promises.writeFile(secretName, secretName);
    const command = [
      'secrets',
      'create',
      '-np',
      dataDir,
      secretName,
      vaultName,
    ];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).not.toBe(0);
    // The root directory is already defined so we can't create a new secret
    // at path `vault:/`.
    expect(result.stderr).toInclude('ErrorSecretsIsDirectory');
  });
  test.prop([fileNameArb, fileNameArb, envVariableArb], { numRuns: 10 })(
    'secrets handle unix style paths for secrets',
    async (directoryName, secretName, envVariableName) => {
      await polykeyAgent.vaultManager.stop();
      await polykeyAgent.vaultManager.start({ fresh: true });
      const vaultName = 'vault' as VaultName;
      const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
      const secretPath = path.join(dataDir, 'secret');
      const secretContent = 'this is a secret';
      await fs.promises.writeFile(secretPath, secretContent);
      const vaultsSecretPath = path.join(directoryName, secretName);
      const command = [
        'secrets',
        'create',
        '-np',
        dataDir,
        secretPath,
        `${vaultName}:${vaultsSecretPath}=${envVariableName}`,
      ];
      const result = await testUtils.pkStdio(command, {
        env: { PK_PASSWORD: password },
        cwd: dataDir,
      });
      expect(result.exitCode).toBe(0);
      await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
        const list = await vaultOps.listSecrets(vault);
        expect(list.sort()).toStrictEqual([vaultsSecretPath]);
        expect(
          (await vaultOps.getSecret(vault, vaultsSecretPath)).toString(),
        ).toStrictEqual(secretContent);
      });
    },
  );
});
