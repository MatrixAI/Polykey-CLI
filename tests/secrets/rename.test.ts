import type { VaultName } from 'polykey/vaults/types.js';
import path from 'node:path';
import fs from 'node:fs';
import Logger, { LogLevel, StreamHandler } from '@matrixai/logger';
import PolykeyAgent from 'polykey/PolykeyAgent.js';
import { vaultOps } from 'polykey/vaults/index.js';
import * as keysUtils from 'polykey/keys/utils/index.js';
import * as testUtils from '../utils/index.js';

describe('commandRenameSecret', () => {
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

  test('should rename secrets using a simple new name', async () => {
    const vaultName = 'vaultSimpleRename' as VaultName;
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const oldSecretName = 'secretOriginal';
    const newSecretBaseName = 'secretNewBase'; // Changed variable name for clarity
    const secretContent = 'this is the secret for simple rename';
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, oldSecretName, secretContent);
    });
    command = [
      'secrets',
      'rename',
      '-np',
      dataDir,
      `${vaultName}:${oldSecretName}`,
      newSecretBaseName, // Use the simple base name
    ];
    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe(''); // Expect no errors
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const list = await vaultOps.listSecrets(vault);
      expect(list.sort()).toStrictEqual([newSecretBaseName]);
      expect(list).not.toContain(oldSecretName);
    });
  });

  // New test case for the fix
  test('should rename secret when new name is a fully qualified path', async () => {
    const vaultName = 'vaultFQRename' as VaultName; // Use a distinct vault name for the test
    const vaultId = await polykeyAgent.vaultManager.createVault(vaultName);
    const oldSecretName = 'oldSecretName';
    const newSecretBaseName = 'newSecretNameByPath'; // The actual target base name
    const secretContent = 'content for fully qualified path rename test';

    // Add initial secret
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      await vaultOps.addSecret(vault, oldSecretName, secretContent);
    });

    // Construct the fully qualified path for the new secret name
    // This format matches the problematic case: VaultName:/NewName
    const newSecretFullyQualified = `${vaultName}:/${newSecretBaseName}`;

    command = [
      'secrets',
      'rename',
      '-np',
      dataDir,
      `${vaultName}:${oldSecretName}`, // Source secret path
      newSecretFullyQualified, // New secret name as fully qualified path
    ];

    const result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe(''); // Expect no errors

    // Verify the rename
    await polykeyAgent.vaultManager.withVaults([vaultId], async (vault) => {
      const secretsList = await vaultOps.listSecrets(vault);
      expect(secretsList).toContain(newSecretBaseName); // Check for the base name
      expect(secretsList).not.toContain(oldSecretName);
      expect(secretsList.length).toBe(1); // Assuming only this secret is in the test vault
    });
  });

  test('should not rename vault root', async () => {
    const vaultName = 'vaultRootTest' as VaultName; // Use a distinct vault name
    await polykeyAgent.vaultManager.createVault(vaultName);
    // Attempting to rename the vault itself, or an empty path within it
    command = [
      'secrets',
      'rename',
      '-np',
      dataDir,
      `${vaultName}:/`,
      'newNameForRoot',
    ];
    let result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toInclude('EPERM');

    // Original test for trying to rename the vault name directly (which parseSecretPath handles as [vaultName, undefined, undefined])
    // The `CommandRename` checks secretPath[1] == null, which covers `vaultName` (no colon) for the first arg.
    command = ['secrets', 'rename', '-np', dataDir, vaultName, 'rename'];
    result = await testUtils.pkStdio(command, {
      env: { PK_PASSWORD: password },
      cwd: dataDir,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr).toInclude('EPERM'); // This is because secretPath[1] will be undefined
  });
});
